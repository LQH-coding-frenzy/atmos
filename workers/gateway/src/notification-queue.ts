export type NotificationQueueMessage = {
  version: 1;
  event_id: string;
  delivery_id: string;
  kind: 'weather-alert';
  attempt_hint: number;
};

export function assertNotificationMessage(message: NotificationQueueMessage) {
  if (message.version !== 1 || message.kind !== 'weather-alert') {
    throw new Error('notification message version or kind is invalid');
  }
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(message.event_id)) {
    throw new Error('event_id must be a UUID');
  }
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(message.delivery_id)) {
    throw new Error('delivery_id must be a UUID');
  }
  if (!Number.isInteger(message.attempt_hint) || message.attempt_hint < 0) {
    throw new Error('attempt_hint must be a non-negative integer');
  }
}

export function publishNotification(
  queue: Queue<NotificationQueueMessage>,
  message: NotificationQueueMessage,
) {
  assertNotificationMessage(message);
  return queue.send(message);
}
