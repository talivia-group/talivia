export interface PaymentCustomerIdentity {
  name?: string | null;
  externalCustomerId?: string | null;
  providerCustomerId?: string | null;
  providerName?: string | null;
  visitorId?: string | null;
}

function titleCase(value?: string | null) {
  if (!value) {
    return 'Payment provider';
  }

  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function hasPaymentCustomerIdentity(customer?: PaymentCustomerIdentity | null) {
  return Boolean(
    customer?.name ||
      customer?.externalCustomerId ||
      customer?.providerCustomerId ||
      customer?.visitorId,
  );
}

export function getPaymentCustomerLabel(customer?: PaymentCustomerIdentity | null) {
  return (
    customer?.name ||
    customer?.externalCustomerId ||
    customer?.providerCustomerId ||
    customer?.visitorId ||
    'Unknown customer'
  );
}

export function getPaymentCustomerDetail(customer?: PaymentCustomerIdentity | null) {
  if (!customer) {
    return null;
  }

  const label = getPaymentCustomerLabel(customer);

  if (customer.providerCustomerId) {
    const provider = titleCase(customer.providerName);

    return label === customer.providerCustomerId
      ? `${provider} customer`
      : `${provider} customer: ${customer.providerCustomerId}`;
  }

  if (customer.externalCustomerId && label !== customer.externalCustomerId) {
    return `Customer ID: ${customer.externalCustomerId}`;
  }

  return null;
}

export function getPaymentCustomerKey(customer: PaymentCustomerIdentity) {
  return [
    customer.providerName,
    customer.providerCustomerId,
    customer.externalCustomerId,
    customer.name,
    customer.visitorId,
  ]
    .filter(Boolean)
    .join(':');
}
