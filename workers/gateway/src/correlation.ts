const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const requestUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  const hasRequestId = requestIdPattern.test(requestId ?? '');
  const generatedRequestId = hasRequestId ? undefined : randomUuid();
  const normalizedRequestId = hasRequestId ? requestId! : generatedRequestId!;
  if (validTraceparent(traceparent)) {
    return { requestId: normalizedRequestId, traceparent: traceparent! };
  }
  const traceIdSource =
    generatedRequestId ??
    (requestUuidPattern.test(normalizedRequestId) ? normalizedRequestId : randomUuid());
  const traceId = traceIdSource.replaceAll('-', '').toLowerCase();
  const spanId = randomUuid().replaceAll('-', '').slice(-16).toLowerCase();
  return { requestId: normalizedRequestId, traceparent: `00-${traceId}-${spanId}-01` };
}
