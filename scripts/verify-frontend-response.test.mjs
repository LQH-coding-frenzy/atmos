import assert from 'node:assert/strict';
import test from 'node:test';
import { headersFromCurlDump, verifyFrontendResponse } from './verify-frontend-response.mjs';

const validHeaders = `HTTP/2 200
content-security-policy: default-src 'self'; object-src 'none'; frame-ancestors 'none'
permissions-policy: camera=(), microphone=(), geolocation=(self)
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=63072000; includeSubDomains
x-content-type-options: nosniff
x-frame-options: DENY

`;

test('accepts a successful hardened frontend response', () => {
  assert.doesNotThrow(() => verifyFrontendResponse(200, headersFromCurlDump(validHeaders)));
});

test('uses the final response block from a curl header dump', () => {
  const headers = headersFromCurlDump(
    `HTTP/1.1 307 Temporary Redirect\nlocation: /\n\n${validHeaders}`,
  );
  assert.equal(headers.get('x-frame-options'), 'DENY');
});

test('rejects failures and missing security controls', () => {
  assert.throws(() => verifyFrontendResponse(503, headersFromCurlDump(validHeaders)), /HTTP 503/);
  assert.throws(
    () => verifyFrontendResponse(200, headersFromCurlDump('HTTP/2 200\nx-frame-options: DENY\n\n')),
    /permissions-policy/,
  );
});
