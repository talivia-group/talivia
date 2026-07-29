import { headers } from 'next/headers';
import {
  APP_SECRET_CONFIGURATION_ERROR_CODE,
  APP_SECRET_CONFIGURATION_ERROR_MESSAGE,
} from '@/lib/app-config';
import { SHARE_CONTEXT_HEADER, SHARE_TOKEN_HEADER } from '@/lib/constants';
import { redactSharedData, type SharedRedactionOptions } from '@/lib/share-redaction';

export function ok() {
  return Response.json({ ok: true });
}

async function hasShareResponseContext() {
  try {
    const requestHeaders = await headers();

    return (
      requestHeaders.get(SHARE_CONTEXT_HEADER) === '1' &&
      Boolean(requestHeaders.get(SHARE_TOKEN_HEADER))
    );
  } catch {
    return false;
  }
}

export async function json(data: any = {}, options: SharedRedactionOptions = {}) {
  const responseData = (await hasShareResponseContext()) ? redactSharedData(data, options) : data;

  return Response.json(responseData);
}

export function badRequest(error?: Record<string, any>) {
  return Response.json(
    {
      error: { message: 'Bad request', code: 'bad-request', status: 400, ...error },
    },
    { status: 400 },
  );
}

export function unauthorized(error?: Record<string, any>) {
  return Response.json(
    {
      error: {
        message: 'Unauthorized',
        code: 'unauthorized',
        status: 401,
        ...error,
      },
    },
    { status: 401 },
  );
}

export function forbidden(error?: Record<string, any>) {
  return Response.json(
    { error: { message: 'Forbidden', code: 'forbidden', status: 403, ...error } },
    { status: 403 },
  );
}

export function notFound(error?: Record<string, any>) {
  return Response.json(
    { error: { message: 'Not found', code: 'not-found', status: 404, ...error } },
    { status: 404 },
  );
}

export function serverError(error?: Record<string, any>) {
  return Response.json(
    {
      error: {
        message: 'Server error',
        code: 'server-error',
        status: 500,
        ...error,
      },
    },
    { status: 500 },
  );
}

export function appConfigurationError() {
  return serverError({
    message: APP_SECRET_CONFIGURATION_ERROR_MESSAGE,
    code: APP_SECRET_CONFIGURATION_ERROR_CODE,
  });
}

export function paymentRequired(error?: Record<string, any>) {
  return Response.json(
    {
      error: { message: 'Payment required', code: 'payment-required', status: 402, ...error },
    },
    { status: 402 },
  );
}
