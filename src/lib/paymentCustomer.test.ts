import { describe, expect, test } from 'vitest';
import {
  getPaymentCustomerDetail,
  getPaymentCustomerLabel,
  hasPaymentCustomerIdentity,
} from './paymentCustomer';

describe('payment customer identity', () => {
  test('describes a provider customer id without treating it as a session', () => {
    const customer = { providerName: 'stripe', providerCustomerId: 'cus_123' };

    expect(getPaymentCustomerLabel(customer)).toBe('cus_123');
    expect(getPaymentCustomerDetail(customer)).toBe('Stripe customer');
  });

  test('prefers a customer name while retaining the provider identity as detail', () => {
    const customer = {
      name: 'Ada Lovelace',
      providerName: 'stripe',
      providerCustomerId: 'cus_123',
    };

    expect(getPaymentCustomerLabel(customer)).toBe('Ada Lovelace');
    expect(getPaymentCustomerDetail(customer)).toBe('Stripe customer: cus_123');
  });

  test('does not create an identity from a provider name alone', () => {
    expect(hasPaymentCustomerIdentity({ providerName: 'stripe' })).toBe(false);
  });
});
