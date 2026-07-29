import { describe, expect, test } from 'vitest';
import {
  shouldApplySubscriptionEvent,
  subscriptionEventPriority,
  yolfiEventDate,
} from './subscription-event-ordering';

describe('subscription event ordering', () => {
  test('newer events win even after a terminal state', () => {
    expect(
      shouldApplySubscriptionEvent({
        incomingAt: new Date('2026-01-02T00:00:00Z'),
        incomingPriority: 100,
        storedAt: new Date('2026-01-01T00:00:00Z'),
        storedPriority: 300,
      }),
    ).toBe(true);
  });

  test('older events never replace newer state', () => {
    expect(
      shouldApplySubscriptionEvent({
        incomingAt: new Date('2026-01-01T00:00:00Z'),
        incomingPriority: 100,
        storedAt: new Date('2026-01-02T00:00:00Z'),
        storedPriority: 300,
      }),
    ).toBe(false);
  });

  test('terminal priority wins at an equal timestamp', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    expect(
      shouldApplySubscriptionEvent({
        incomingAt: at,
        incomingPriority: subscriptionEventPriority('subscription.cancelled'),
        storedAt: at,
        storedPriority: subscriptionEventPriority('payment.confirmed'),
      }),
    ).toBe(true);
    expect(
      shouldApplySubscriptionEvent({
        incomingAt: at,
        incomingPriority: subscriptionEventPriority('payment.confirmed'),
        storedAt: at,
        storedPriority: subscriptionEventPriority('subscription.cancelled'),
      }),
    ).toBe(false);
  });

  test('same timestamp and priority is an idempotent no-op', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    expect(
      shouldApplySubscriptionEvent({
        incomingAt: at,
        incomingPriority: 200,
        storedAt: at,
        storedPriority: 200,
      }),
    ).toBe(false);
  });

  test('uses updatedAt, then createdAt, then envelope created', () => {
    expect(
      yolfiEventDate(
        { updatedAt: 'invalid', createdAt: '2026-01-02T00:00:00Z' },
        { created: 1_700_000_000 },
      ).toISOString(),
    ).toBe('2026-01-02T00:00:00.000Z');
    expect(yolfiEventDate({}, { created: 1_700_000_000 }).toISOString()).toBe(
      '2023-11-14T22:13:20.000Z',
    );
  });

  test('rejects an event without a deterministic timestamp', () => {
    expect(() => yolfiEventDate({}, {})).toThrow('Yolfi event timestamp is invalid.');
  });
});
