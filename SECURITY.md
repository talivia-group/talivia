# Security

## Reporting a vulnerability

Please do not publish exploit details in a public issue. Use the repository host's private
vulnerability-reporting channel when it is available. Include the affected version, impact,
reproduction steps, and any suggested mitigation.

## Self-hosting guidance

- Replace the bootstrap `admin` password immediately.
- Generate a long, random `APP_SECRET`, store it outside source control, and do not rotate it
  without a provider-secret migration plan.
- Serve Talivia behind HTTPS and forward the original `Host` and protocol headers to the app.
- Restrict PostgreSQL and optional Redis, ClickHouse, and Kafka services to private networks.
- Keep the container image, database, and reverse proxy patched.
- Back up the database and test restores regularly.
- Treat payment-provider credentials and webhook secrets as production secrets.

Supported security updates are published as normal releases. Deployment operators are responsible
for applying them and for the security of their infrastructure.
