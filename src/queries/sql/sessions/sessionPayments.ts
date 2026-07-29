import { REVENUE_PAYMENT_STATUSES } from '@/lib/payment-status';
import {
  getPaymentCustomerKey,
  hasPaymentCustomerIdentity,
  type PaymentCustomerIdentity,
} from '@/lib/paymentCustomer';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

type SessionPayment = {
  id: string;
  providerName: string;
  providerCustomerId?: string | null;
  customerIdentity?: {
    name?: string | null;
    externalCustomerId?: string | null;
    providerCustomerId?: string | null;
  } | null;
  amount: unknown;
  currency: string;
  reportingAmount?: unknown;
  reportingCurrency?: string | null;
  paymentStatus: string;
  refundAmount?: unknown;
  disputeAmount?: unknown;
  occurredAt: Date;
};

function toNumber(value: unknown) {
  return Number(value || 0);
}

function getPaymentCurrency(payment: SessionPayment) {
  return payment.reportingCurrency || payment.currency;
}

function getPaymentNetAmount(payment: SessionPayment) {
  const originalAmount = toNumber(payment.amount);
  const reportingAmount = toNumber(payment.reportingAmount ?? payment.amount);
  const adjustmentScale = originalAmount > 0 ? reportingAmount / originalAmount : 1;

  return Math.max(
    reportingAmount -
      (toNumber(payment.refundAmount) + toNumber(payment.disputeAmount)) * adjustmentScale,
    0,
  );
}

async function getSessionPayments(
  websiteId: string,
  sessionId: string,
  filters?: Pick<QueryFilters, 'startDate' | 'endDate'>,
) {
  return prisma.client.payment.findMany({
    where: {
      websiteId,
      sessionId,
      paymentStatus: {
        in: REVENUE_PAYMENT_STATUSES,
      },
      ...(filters?.startDate &&
        filters?.endDate && {
          occurredAt: {
            gte: filters.startDate,
            lte: filters.endDate,
          },
        }),
    },
    orderBy: {
      occurredAt: 'desc',
    },
    select: {
      id: true,
      providerName: true,
      providerCustomerId: true,
      customerIdentity: {
        select: {
          name: true,
          externalCustomerId: true,
          providerCustomerId: true,
        },
      },
      amount: true,
      currency: true,
      reportingAmount: true,
      reportingCurrency: true,
      paymentStatus: true,
      refundAmount: true,
      disputeAmount: true,
      occurredAt: true,
    },
  });
}

export async function getSessionPaymentSummary(websiteId: string, sessionId: string) {
  const payments = await getSessionPayments(websiteId, sessionId);
  const spendRows = summarizePaymentSpend(payments);

  return {
    spend: spendRows[0]?.amount || 0,
    spendCurrency: spendRows[0]?.currency || null,
    spendByCurrency: spendRows,
    paymentCount: payments.length,
    paymentFirstAt: payments.length ? payments[payments.length - 1].occurredAt : null,
    paymentLastAt: payments[0]?.occurredAt || null,
    customers: getSessionPaymentCustomers(payments),
    paymentProviders: getSessionPaymentProviders(payments),
  };
}

export async function withSessionPaymentSummaries(websiteId: string, sessions: any[]) {
  const sessionIds = sessions.map(session => session.id).filter(Boolean);

  if (!sessionIds.length) {
    return sessions;
  }

  const payments = await prisma.client.payment.findMany({
    where: {
      websiteId,
      sessionId: {
        in: sessionIds,
      },
      paymentStatus: {
        in: REVENUE_PAYMENT_STATUSES,
      },
    },
    orderBy: {
      occurredAt: 'desc',
    },
    select: {
      sessionId: true,
      amount: true,
      currency: true,
      reportingAmount: true,
      reportingCurrency: true,
      refundAmount: true,
      disputeAmount: true,
      occurredAt: true,
    },
  });
  const paymentsBySession = new Map<string, typeof payments>();

  for (const payment of payments) {
    if (!payment.sessionId) {
      continue;
    }

    paymentsBySession.set(payment.sessionId, [
      ...(paymentsBySession.get(payment.sessionId) || []),
      payment,
    ]);
  }

  return sessions.map(session => {
    const sessionPayments = paymentsBySession.get(session.id) || [];
    const spendRows = summarizePaymentSpend(sessionPayments);

    return {
      ...session,
      spend: spendRows[0]?.amount || 0,
      spendCurrency: spendRows[0]?.currency || null,
      spendByCurrency: spendRows,
      paymentCount: sessionPayments.length,
      paymentLastAt: sessionPayments[0]?.occurredAt || null,
    };
  });
}

export async function getSessionPaymentActivity(
  websiteId: string,
  sessionId: string,
  filters: Pick<QueryFilters, 'startDate' | 'endDate'>,
) {
  const payments = await getSessionPayments(websiteId, sessionId, filters);

  return payments.map(payment => ({
    eventId: `payment-${payment.id}`,
    createdAt: payment.occurredAt,
    eventType: 'payment',
    eventName: null,
    hostname: null,
    hasData: false,
    paymentId: payment.id,
    paymentAmount: getPaymentNetAmount(payment),
    paymentCurrency: getPaymentCurrency(payment),
    paymentStatus: payment.paymentStatus,
    paymentProvider: payment.providerName,
  }));
}

function summarizePaymentSpend(
  payments: Pick<
    SessionPayment,
    | 'amount'
    | 'currency'
    | 'reportingAmount'
    | 'reportingCurrency'
    | 'refundAmount'
    | 'disputeAmount'
  >[],
) {
  const spendByCurrency = new Map<string, number>();

  for (const payment of payments) {
    const currency = getPaymentCurrency(payment as SessionPayment);

    spendByCurrency.set(
      currency,
      (spendByCurrency.get(currency) || 0) + getPaymentNetAmount(payment as SessionPayment),
    );
  }

  return [...spendByCurrency.entries()].map(([currency, amount]) => ({
    currency,
    amount,
  }));
}

function getSessionPaymentCustomers(payments: SessionPayment[]) {
  const customers = new Map<string, PaymentCustomerIdentity>();

  for (const payment of payments) {
    const customer: PaymentCustomerIdentity = {
      name: payment.customerIdentity?.name,
      externalCustomerId: payment.customerIdentity?.externalCustomerId,
      providerCustomerId:
        payment.customerIdentity?.providerCustomerId || payment.providerCustomerId,
      providerName: payment.providerName,
    };

    if (!hasPaymentCustomerIdentity(customer)) {
      continue;
    }

    const key = getPaymentCustomerKey(customer);

    if (!customers.has(key)) {
      customers.set(key, customer);
    }
  }

  return [...customers.values()];
}

function getSessionPaymentProviders(payments: SessionPayment[]) {
  return [...new Set(payments.map(payment => payment.providerName).filter(Boolean))];
}
