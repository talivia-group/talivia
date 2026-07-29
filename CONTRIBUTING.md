# Contributing

Thank you for helping improve Talivia.

## Development setup

1. Install Node.js 22 LTS or 24 LTS, pnpm 10+, and PostgreSQL.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and a random `APP_SECRET`.
3. Use a new, empty database.
4. Run `pnpm install --frozen-lockfile`.
5. Run `pnpm exec prisma migrate deploy`.
6. Start the app with `pnpm dev`.

Before submitting a change, run:

```bash
pnpm lint
pnpm test
pnpm build
```

Add focused tests for behavior changes. Keep hosted-service billing, email or social login,
commercial pages, and external insight-monitoring integrations out of the Open Source edition.
Do not commit `.env` files, database dumps, build output, credentials, or customer data.

## Database changes

Create forward-only Prisma migrations for schema changes. Do not rewrite an already released
migration. Test migrations against a new PostgreSQL database and against a database from the
previous Open Source release.

By contributing, you agree that your contribution is licensed under the MIT License.
