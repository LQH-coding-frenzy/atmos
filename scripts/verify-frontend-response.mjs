import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function headersFromCurlDump(value) {
  const lines = value.replaceAll('\r\n', '\n').split('\n');
  const responseStart = lines.findLastIndex((line) => /^HTTP\/\S+ \d{3}/.test(line));
  if (responseStart < 0) throw new Error('Response headers do not contain an HTTP status line.');

  const headers = new Headers();
  for (const line of lines.slice(responseStart + 1)) {
    if (!line) break;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return headers;
}

export function verifyFrontendResponse(status, headers) {
  if (status !== 200) throw new Error(`Frontend smoke returned HTTP ${status}.`);

  const exactHeaders = {
    'permissions-policy': 'camera=(), microphone=(), geolocation=(self)',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=63072000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
  for (const [name, expected] of Object.entries(exactHeaders)) {
    if (headers.get(name) !== expected) throw new Error(`Frontend response has invalid ${name}.`);
  }

  const policy = headers.get('content-security-policy') ?? '';
  for (const directive of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
    if (!policy.includes(directive)) {
      throw new Error(`Frontend response CSP is missing ${directive}.`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [statusValue, headersPath] = process.argv.slice(2);
    const status = Number.parseInt(statusValue ?? '', 10);
    if (!headersPath || !Number.isInteger(status))
      throw new Error('Status and header file are required.');
    verifyFrontendResponse(status, headersFromCurlDump(readFileSync(headersPath, 'utf8')));
    process.stdout.write('Frontend response verification passed.\n');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Verification failed.'}\n`);
    process.exitCode = 1;
  }
}
