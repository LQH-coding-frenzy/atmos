const maximumSignInAgeMilliseconds = 5 * 60_000;
const allowedFutureClockSkewMilliseconds = 60_000;

/**
 * @param {{ accountEmail?: string; confirmationEmail?: unknown; confirmationPhrase?: unknown; lastSignInAt?: string | null; now?: number }} input
 * @returns {'confirmation-required' | 'reauthentication-required' | null}
 */
export function validateAccountDeletionRequest({
  accountEmail,
  confirmationEmail,
  confirmationPhrase,
  lastSignInAt,
  now = Date.now(),
}) {
  if (
    !accountEmail ||
    typeof confirmationEmail !== 'string' ||
    confirmationEmail.trim().toLocaleLowerCase('en-US') !==
      accountEmail.trim().toLocaleLowerCase('en-US') ||
    confirmationPhrase !== 'DELETE'
  ) {
    return 'confirmation-required';
  }

  const signedInAt = lastSignInAt ? Date.parse(lastSignInAt) : Number.NaN;
  if (
    !Number.isFinite(signedInAt) ||
    signedInAt > now + allowedFutureClockSkewMilliseconds ||
    now - signedInAt > maximumSignInAgeMilliseconds
  ) {
    return 'reauthentication-required';
  }

  return null;
}
