import { describe, expect, test } from 'vitest';
import {
  isSensitivePropertyKey,
  redactSharedData,
  redactSharedQuery,
  SHARED_REDACTED_VALUE,
} from './share-redaction';

describe('shared response redaction', () => {
  test('masks identity and provider fields while preserving analytics and navigation fields', () => {
    const occurredAt = new Date('2026-07-14T10:00:00.000Z');
    const input = {
      websiteId: 'website-1',
      sessionId: 'session-1',
      paymentId: 'payment-1',
      amount: 13,
      currency: 'USD',
      occurredAt,
      source: 'google',
      customer: {
        name: 'Ada Lovelace',
        externalCustomerId: 'customer-123',
        providerCustomerId: 'cus_123',
        providerName: 'stripe',
      },
      visitorLabel: 'Ada Lovelace',
      visitorId: 'visitor-secret',
      visitorToken: 'v_secret',
      sessionToken: 's_secret',
      transactionId: 'pi_123',
      providerCheckoutId: 'cs_123',
    };

    expect(redactSharedData(input)).toEqual({
      websiteId: 'website-1',
      sessionId: 'session-1',
      paymentId: 'payment-1',
      amount: 13,
      currency: 'USD',
      occurredAt,
      source: 'google',
      customer: {
        name: SHARED_REDACTED_VALUE,
        externalCustomerId: SHARED_REDACTED_VALUE,
        providerCustomerId: SHARED_REDACTED_VALUE,
        providerName: 'stripe',
      },
      visitorLabel: SHARED_REDACTED_VALUE,
      visitorId: SHARED_REDACTED_VALUE,
      visitorToken: SHARED_REDACTED_VALUE,
      sessionToken: SHARED_REDACTED_VALUE,
      transactionId: SHARED_REDACTED_VALUE,
      providerCheckoutId: SHARED_REDACTED_VALUE,
    });
  });

  test('does not mask generic names or ids outside identity context', () => {
    expect(
      redactSharedData({
        id: 'event-1',
        name: 'Signup completed',
        eventName: 'signup',
        reportId: 'report-1',
      }),
    ).toEqual({
      id: 'event-1',
      name: 'Signup completed',
      eventName: 'signup',
      reportId: 'report-1',
    });
  });

  test('masks sensitive dynamic property values but keeps ordinary analytics properties', () => {
    const input = [
      {
        dataKey: 'profile.email',
        dataType: 1,
        stringValue: 'person@example.com',
        numberValue: null,
        dateValue: null,
      },
      {
        dataKey: 'visibility_percentage',
        dataType: 2,
        stringValue: '100.0000',
        numberValue: 100,
        dateValue: null,
      },
    ];

    expect(redactSharedData(input)).toEqual([
      {
        dataKey: 'profile.email',
        dataType: 1,
        stringValue: SHARED_REDACTED_VALUE,
        numberValue: null,
        dateValue: null,
      },
      input[1],
    ]);
  });

  test('masks value lists using the property name supplied by the route', () => {
    expect(
      redactSharedData(
        [
          { value: 'person@example.com', total: 4 },
          { value: 'other@example.com', total: 2 },
        ],
        { propertyName: 'customer_email' },
      ),
    ).toEqual([
      { value: SHARED_REDACTED_VALUE, total: 4 },
      { value: SHARED_REDACTED_VALUE, total: 2 },
    ]);
  });

  test('keeps attribution query parameters and masks identity or credential values', () => {
    expect(
      redactSharedQuery(
        'https://example.com/pricing?utm_source=google&email=person%40example.com&authToken=abc#top',
      ),
    ).toBe(
      `https://example.com/pricing?utm_source=google&email=${SHARED_REDACTED_VALUE}&authToken=${SHARED_REDACTED_VALUE}#top`,
    );
  });

  test('masks provider identifiers in checkout return URLs', () => {
    expect(
      redactSharedQuery(
        'https://example.com/thanks?payment_id=pay_123&subscription_id=sub_123&checkout_id=cks_123&utm_source=launch',
      ),
    ).toBe(
      `https://example.com/thanks?payment_id=${SHARED_REDACTED_VALUE}&subscription_id=${SHARED_REDACTED_VALUE}&checkout_id=${SHARED_REDACTED_VALUE}&utm_source=launch`,
    );
  });

  test('classifies exact and nested sensitive property names without matching business fields', () => {
    expect(isSensitivePropertyKey('customerId')).toBe(true);
    expect(isSensitivePropertyKey('profile.email')).toBe(true);
    expect(isSensitivePropertyKey('authorization_token')).toBe(true);
    expect(isSensitivePropertyKey('visitor_id')).toBe(true);
    expect(isSensitivePropertyKey('client_ip')).toBe(true);
    expect(isSensitivePropertyKey('provider_payment_id')).toBe(true);
    expect(isSensitivePropertyKey('payment_id')).toBe(true);
    expect(isSensitivePropertyKey('subscription_id')).toBe(true);
    expect(isSensitivePropertyKey('checkout_id')).toBe(true);
    expect(isSensitivePropertyKey('visibility_percentage')).toBe(false);
    expect(isSensitivePropertyKey('plan_name')).toBe(false);
  });

  test('masks provider identifiers embedded in timeline details', () => {
    expect(
      redactSharedData({
        detail: 'checkout external-order-987 for person@example.com',
        metadata: {
          providerCheckoutId: 'external-order-987',
          providerEventKey: 'evt_123',
          providerName: 'stripe',
        },
      }),
    ).toEqual({
      detail: `checkout ${SHARED_REDACTED_VALUE} for ${SHARED_REDACTED_VALUE}`,
      metadata: {
        providerCheckoutId: SHARED_REDACTED_VALUE,
        providerEventKey: SHARED_REDACTED_VALUE,
        providerName: 'stripe',
      },
    });
  });

  test('masks direct personal and device fingerprint fields', () => {
    expect(
      redactSharedData({
        phone: '+1 555 0100',
        ipAddress: '203.0.113.10',
        userAgent: 'Raw identifying user agent',
        fingerprint: 'fingerprint-123',
        customer: { id: 'customer-identity-1', name: 'Ada' },
        country: 'US',
        browser: 'Chrome',
      }),
    ).toEqual({
      phone: SHARED_REDACTED_VALUE,
      ipAddress: SHARED_REDACTED_VALUE,
      userAgent: SHARED_REDACTED_VALUE,
      fingerprint: SHARED_REDACTED_VALUE,
      customer: { id: SHARED_REDACTED_VALUE, name: SHARED_REDACTED_VALUE },
      country: 'US',
      browser: 'Chrome',
    });
  });

});
