import { createClient } from '@supabase/supabase-js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ownerUserIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const projectRefPattern = /^[a-z0-9][a-z0-9-]{2,62}$/;
const supabaseDomain = '.supabase.co';
const usersPerPage = 1000;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseBootstrapOwnerArguments(argv) {
  let userId;
  let projectRef;
  let apply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    if (argument !== '--user-id' && argument !== '--project-ref') {
      throw new Error('Use --user-id, --project-ref, and optional --apply.');
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error('A value is required for each bootstrap option.');
    }
    if (argument === '--user-id') userId = value;
    if (argument === '--project-ref') projectRef = value;
    index += 1;
  }

  if (!userId || !ownerUserIdPattern.test(userId)) {
    throw new Error('A valid Supabase Auth user UUID is required.');
  }
  if (!projectRef || !projectRefPattern.test(projectRef)) {
    throw new Error('A valid expected Supabase project ref is required.');
  }
  return { userId: userId.toLowerCase(), projectRef, apply };
}

export function validateBootstrapConfiguration({ supabaseUrl, projectSecretKey, projectRef }) {
  if (typeof projectSecretKey !== 'string' || !projectSecretKey.startsWith('sb_secret_')) {
    throw new Error('PROJECT_SECRET_KEY must contain a current Supabase Secret Key.');
  }

  let targetUrl;
  try {
    targetUrl = new URL(supabaseUrl);
  } catch {
    throw new Error('SUPABASE_URL must identify the confirmed hosted Supabase project.');
  }
  if (
    targetUrl.protocol !== 'https:' ||
    targetUrl.username ||
    targetUrl.password ||
    targetUrl.pathname !== '/' ||
    targetUrl.search ||
    targetUrl.hash ||
    !targetUrl.hostname.endsWith(supabaseDomain) ||
    targetUrl.hostname.slice(0, -supabaseDomain.length) !== projectRef
  ) {
    throw new Error('The confirmed project ref does not match SUPABASE_URL.');
  }
  return targetUrl;
}

export async function bootstrapSingleOwner(authAdmin, userId, { apply = false } = {}) {
  if (typeof userId !== 'string' || !ownerUserIdPattern.test(userId)) {
    throw new Error('A valid Supabase Auth user UUID is required.');
  }
  const normalizedUserId = userId.toLowerCase();

  let targetUser;
  let assignedOwnerUserId;
  let page = 1;
  while (true) {
    let result;
    try {
      result = await authAdmin.listUsers({ page, perPage: usersPerPage });
    } catch {
      throw new Error('Could not verify Auth users; no role was changed.');
    }
    const users = result?.data?.users;
    if (result?.error || !Array.isArray(users)) {
      throw new Error('Could not verify Auth users; no role was changed.');
    }

    for (const user of users) {
      const metadata = isRecord(user.app_metadata) ? user.app_metadata : {};
      const role = metadata.atmos_role;
      if (role !== undefined && role !== 'owner' && role !== 'user') {
        throw new Error('Unsupported application role metadata exists; no role was changed.');
      }
      if (role === 'owner') {
        if (assignedOwnerUserId) {
          throw new Error('More than one owner is already assigned; no role was changed.');
        }
        assignedOwnerUserId = user.id;
      }
      if (user.id === normalizedUserId) targetUser = user;
    }

    if (users.length < usersPerPage) break;
    page += 1;
  }

  if (!targetUser) throw new Error('The specified Auth user was not found; no role was changed.');
  if (assignedOwnerUserId === normalizedUserId) return 'already-owner';
  if (assignedOwnerUserId) {
    throw new Error('An owner is already assigned; bootstrap is limited to one owner.');
  }
  if (!apply) return 'dry-run';

  const currentMetadata = isRecord(targetUser.app_metadata) ? targetUser.app_metadata : {};
  try {
    const { error } = await authAdmin.updateUserById(normalizedUserId, {
      app_metadata: { ...currentMetadata, atmos_role: 'owner' },
    });
    if (error) throw new Error('Auth Admin rejected the update.');
  } catch {
    throw new Error('Owner role assignment failed; verify Auth Admin state before retrying.');
  }
  return 'assigned-owner';
}

async function main(argv = process.argv.slice(2), environment = process.env) {
  const options = parseBootstrapOwnerArguments(argv);
  const supabaseUrl = environment.SUPABASE_URL;
  const projectSecretKey = environment.PROJECT_SECRET_KEY;
  validateBootstrapConfiguration({
    supabaseUrl,
    projectSecretKey,
    projectRef: options.projectRef,
  });

  const client = createClient(supabaseUrl, projectSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const result = await bootstrapSingleOwner(client.auth.admin, options.userId, {
    apply: options.apply,
  });
  if (result === 'dry-run') {
    console.log(
      'Dry run passed. No Auth metadata was changed. Rerun with --apply to assign the initial owner.',
    );
  } else if (result === 'already-owner') {
    console.log('The confirmed account is already the single owner. No Auth metadata was changed.');
  } else {
    console.log('Owner role assigned. Refresh the account session to receive updated metadata.');
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Owner bootstrap failed safely.');
    process.exitCode = 1;
  });
}
