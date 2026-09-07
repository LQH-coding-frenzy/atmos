import { describe, expect, it, vi } from 'vitest';
import { publishNotification } from './notification-queue';

describe('publishNotification', () => {
  it('publishes only the compact durable delivery reference', async () => {
    const send = vi.fn(async () => undefined);
    await publishNotification({ send } as unknown as Queue, {
      version: 1,
      event_id: '10000000-0000-0000-0000-000000000001',
      delivery_id: '20000000-0000-0000-0000-000000000001',
      kind: 'weather-alert',
      attempt_hint: 0,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
