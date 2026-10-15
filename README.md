# U-PROX Command Center

Initial monorepo implementation for secure U-PROX operations. `apps/web` is a React + TypeScript + Vite application using React Router, TanStack Query, and Zustand; `apps/api` is the Fastify backend. Docker builds the React application into the Nginx image.

## Local development

On the VM, install Docker Engine and Compose, then copy the repository, create `.env` from `.env.example`, and run `docker compose up -d --build`. Open `http://VM_IP:8080`; check integration mode at `http://VM_IP:8080/api/health`. U-PROX on the same VM is configured through `UPROX_BASE_URL=http://127.0.0.1:40001` (confirm its actual port). Do not publish port 40001.

`Authenticate` and `EventGetList` are implemented server-side with the observed U-PROX 3.057-era authentication and event-list envelope. Door control is deliberately 501 in real mode until the exact `DoorAccessIn`/`DoorAccessOut` request contract is captured from your installed version; mock mode remains safe for UI testing.

## Security boundary

The browser never receives U-PROX credentials or UserSID. API routes authenticate the app session, apply RBAC/rate limiting, call the adapter server-side, and write an audit record with a redacted result. U-PROX endpoint placeholders intentionally throw until verified against the deployed U-PROX version.

See `docs/architecture.md` and `docs/uproxx-adapter.md`.
