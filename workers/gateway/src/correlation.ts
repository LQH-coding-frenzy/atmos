const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const hexBytes = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

function validTraceparent(value: string | undefined) {
  const match = value?.match(traceparentPattern);
  return Boolean(match && match[1] !== '0'.repeat(32) && match[2] !== '0'.repeat(16));
}

function fastCorrelationIds(needsRequestId: boolean, needsTraceparent: boolean) {
  const bytes = new Uint8Array((needsRequestId ? 16 : 0) + (needsTraceparent ? 24 : 0));
  if (bytes.length > 0) crypto.getRandomValues(bytes);

  let offset = 0;
  let requestId = '';
  if (needsRequestId) {
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    requestId =
      `${hexBytes[bytes[0]!]!}${hexBytes[bytes[1]!]!}${hexBytes[bytes[2]!]!}${hexBytes[bytes[3]!]!}-` +
      `${hexBytes[bytes[4]!]!}${hexBytes[bytes[5]!]!}-` +
      `${hexBytes[bytes[6]!]!}${hexBytes[bytes[7]!]!}-` +
      `${hexBytes[bytes[8]!]!}${hexBytes[bytes[9]!]!}-` +
      `${hexBytes[bytes[10]!]!}${hexBytes[bytes[11]!]!}${hexBytes[bytes[12]!]!}` +
      `${hexBytes[bytes[13]!]!}${hexBytes[bytes[14]!]!}${hexBytes[bytes[15]!]!}`;
    offset = 16;
  }

  let traceparent = '';
  if (needsTraceparent) {
    let traceId = '';
    for (let i = 0; i < 16; i += 1) traceId += hexBytes[bytes[offset + i]!]!;
    let spanId = '';
    for (let i = 16; i < 24; i += 1) spanId += hexBytes[bytes[offset + i]!]!;
    traceparent = `00-${traceId}-${spanId}-01`;
  }

  return { requestId, traceparent };
}

export function createCorrelation(
  requestId: string | undefined,
  traceparent: string | undefined,
  randomUuid?: () => string,
) {
  const validReqId = requestIdPattern.test(requestId ?? '');
  const validTrace = validTraceparent(traceparent);
  if (!randomUuid) {
    const fast = fastCorrelationIds(!validReqId, !validTrace);
    return {
      requestId: validReqId ? requestId! : fast.requestId,
      traceparent: validTrace ? traceparent! : fast.traceparent,
    };
  }

  const normalizedRequestId = validReqId ? requestId! : randomUuid();
  if (validTrace) {
    return { requestId: normalizedRequestId, traceparent: traceparent! };
  }
  const traceId = randomUuid().replaceAll('-', '');
  const spanId = randomUuid().replaceAll('-', '').slice(0, 16);
  return { requestId: normalizedRequestId, traceparent: `00-${traceId}-${spanId}-01` };
}
