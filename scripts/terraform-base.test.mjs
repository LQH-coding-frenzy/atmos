import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const versions = await readFile(new URL('../infra/terraform/versions.tf', import.meta.url), 'utf8');
const protectedResources = await Promise.all(
  [
    '../infra/terraform/modules/cloudflare-r2/main.tf',
    '../infra/terraform/modules/cloudflare-edge/main.tf',
    '../infra/terraform/azure-production/main.tf',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
);

test('pins every approved Terraform provider exactly', () => {
  for (const [source, version] of [
    ['hashicorp/azuread', '3.9.0'],
    ['hashicorp/azurerm', '5.5.0'],
    ['cloudflare/cloudflare', '5.25.0'],
    ['supabase/supabase', '1.11.0'],
    ['vercel/vercel', '5.16.0'],
  ]) {
    assert.match(
      versions,
      new RegExp(`source\\s*=\\s*"${source}"[\\s\\S]*?version\\s*=\\s*"= ${version}"`),
    );
  }
});

test('does not configure providers, state, or resources in the shared base', () => {
  assert.doesNotMatch(versions, /^(provider|resource|data|module|cloud)\s+"/m);
  assert.doesNotMatch(versions, /token|secret|client_secret/i);
});

test('protects retained recovery resources from Terraform destruction', () => {
  for (const configuration of protectedResources) {
    assert.match(configuration, /lifecycle\s*\{\s*prevent_destroy\s*=\s*true\s*\}/s);
  }
});
