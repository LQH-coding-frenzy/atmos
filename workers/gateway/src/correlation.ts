const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

function validTraceparent(value: string | undefined) {
  const match = value?.match(traceparentPattern);
  return Boolean(match && match[1] !== '0'.repeat(32) && match[2] !== '0'.repeat(16));
}

export function createCorrelation(
  requestId: string | undefined,
  traceparent: string | undefined,
  randomUuid = () => crypto.randomUUID(),
) {
  const normalizedRequestId = requestIdPattern.test(requestId ?? '') ? requestId! : randomUuid();
  if (validTraceparent(traceparent)) {
    return { requestId: normalizedRequestId, traceparent: traceparent! };
  }
  const traceId = randomUuid().replaceAll('-', '');
  const spanId = randomUuid().replaceAll('-', '').slice(0, 16);
  return { requestId: normalizedRequestId, traceparent: `00-${traceId}-${spanId}-01` };
}
