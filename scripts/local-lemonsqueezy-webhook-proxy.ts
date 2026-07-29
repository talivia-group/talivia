#!/usr/bin/env node
import http from 'node:http';
import { isAllowedLemonSqueezyWebhookRequest } from '../src/lib/local-lemonsqueezy-webhook-proxy';

const proxyPort = 3010;
const appPort = 3000;

const server = http.createServer((request, response) => {
  if (!isAllowedLemonSqueezyWebhookRequest(request.method, request.url)) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: appPort,
      path: request.url,
      method: request.method,
      headers: { ...request.headers, host: `localhost:${appPort}` },
    },
    upstreamResponse => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );

  upstream.on('error', error => {
    console.error('[lemonsqueezy-webhook-proxy] upstream failed', error);
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'application/json' });
    }
    response.end(JSON.stringify({ error: 'Webhook upstream unavailable' }));
  });
  request.pipe(upstream);
});

server.listen(proxyPort, '127.0.0.1', () => {
  console.log(
    `[lemonsqueezy-webhook-proxy] listening on http://127.0.0.1:${proxyPort}; only LemonSqueezy webhook POST requests are allowed`,
  );
});
