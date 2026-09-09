import { describe, expect, it } from 'vitest';
import { createCorrelation } from './correlation';
import { createCorrelation as createWorkerCorrelation } from '../../../workers/gateway/src/correlation';

const uuid = '12345678-1234-4234-9234-123456789abc';
const validTraceparent = '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01';

describe('createCorrelation', () => {
  it('preserves bounded request and W3C trace identifiers', () => {
    expect(createCorrelation('request_123', validTraceparent, () => uuid)).toEqual({
      requestId: 'request_123',
      traceparent: validTraceparent,
    });
  });

  it('regenerates unbounded request IDs and invalid trace identifiers', () => {
    const input = ['x'.repeat(129), `00-${'0'.repeat(32)}-${'0'.repeat(16)}-01`] as const;
    const expected = {
      requestId: uuid,
      traceparent: '00-12345678123442349234123456789abc-1234567812344234-01',
    };

    expect(createCorrelation(...input, () => uuid)).toEqual(expected);
    expect(createWorkerCorrelation(...input, () => uuid)).toEqual(expected);
  });
});
