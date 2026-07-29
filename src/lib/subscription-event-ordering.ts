const EVENT_PRIORITIES: Record<string, number> = {
  'payment.confirmed': 100,
  'subscription.overdue': 200,
  'subscription.cancelled': 300,
};

export function subscriptionEventPriority(eventType: string) {
  return EVENT_PRIORITIES[eventType] ?? 0;
}

export function shouldApplySubscriptionEvent({
  incomingAt,
  incomingPriority,
  storedAt,
  storedPriority,
}: {
  incomingAt: Date;
  incomingPriority: number;
  storedAt: Date;
  storedPriority: number;
}) {
  const incomingTime = incomingAt.getTime();
  const storedTime = storedAt.getTime();
  return incomingTime > storedTime || (incomingTime === storedTime && incomingPriority > storedPriority);
}

function parsedDate(value: unknown) {
  if (typeof value !== 'string' || !value) return undefined;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? undefined : result;
}

export function yolfiEventDate(
  data: Record<string, unknown>,
  event: Record<string, unknown>,
) {
  const fromData = parsedDate(data.updatedAt) || parsedDate(data.createdAt);
  if (fromData) return fromData;

  const created = Number(event.created);
  if (Number.isFinite(created) && created > 0) return new Date(created * 1000);

  throw new Error('Yolfi event timestamp is invalid.');
}
