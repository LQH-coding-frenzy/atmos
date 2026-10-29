import { describe, expect, it, vi } from 'vitest';
import { createCorrelation } from './correlation';

describe('worker request correlation', () => {
  it('reuses a generated request UUID as the trace ID without extra randomness', () => {
    const requestId = '11111111-2222-4333-8444-555555555555';
    const spanUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const randomUuid = vi.fn().mockReturnValueOnce(requestId).mockReturnValueOnce(spanUuid);

    const correlation = createCorrelation(undefined, undefined, randomUuid);

    expect(correlation).toEqual({
      requestId,
      traceparent: `00-${requestId.replaceAll('-', '')}-${spanUuid.replaceAll('-', '').slice(-16)}-01`,
    });
    expect(randomUuid).toHaveBeenCalledTimes(2);
  });

  it('reuses a caller-supplied UUID request ID as the trace ID', () => {
    const requestId = '123e4567-e89b-42d3-a456-426614174000';
    const spanUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const randomUuid = vi.fn().mockReturnValueOnce(spanUuid);

    const correlation = createCorrelation(requestId, undefined, randomUuid);

    expect(correlation.traceparent).toBe(
      `00-${requestId.replaceAll('-', '')}-${spanUuid.replaceAll('-', '').slice(-16)}-01`,
    );
    expect(randomUuid).toHaveBeenCalledOnce();
  });

  it('does not derive trace identifiers from a caller-provided request ID', () => {
    const randomUuid = vi
      .fn()
      .mockReturnValueOnce('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
      .mockReturnValueOnce('11111111-2222-4333-8444-555555555555');

    const correlation = createCorrelation('browser-request-1', undefined, randomUuid);

    expect(correlation.requestId).toBe('browser-request-1');
    expect(correlation.traceparent).toBe('00-aaaaaaaabbbb4ccc8dddeeeeeeeeeeee-8444555555555555-01');
    expect(randomUuid).toHaveBeenCalledTimes(2);
  });
});
