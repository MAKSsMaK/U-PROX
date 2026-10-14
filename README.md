# U-PROX Command Center

Initial monorepo implementation for secure U-PROX operations. The deployed build is a visual, browser-local mock dashboard; production control belongs exclusively in `apps/api`.

## Local development

Serve `dist/` with any static server for the dashboard mock. For the full stack, configure `DATABASE_URL`, `APP_SESSION_SECRET`, `UPROX_BASE_URL`, and `MOCK_UPROX=true` in `.env`; run PostgreSQL from `docker-compose.yml`, apply Prisma migrations, then start the API and web packages.

## Security boundary

The browser never receives U-PROX credentials or UserSID. API routes authenticate the app session, apply RBAC/rate limiting, call the adapter server-side, and write an audit record with a redacted result. U-PROX endpoint placeholders intentionally throw until verified against the deployed U-PROX version.

See `docs/architecture.md` and `docs/uproxx-adapter.md`.
