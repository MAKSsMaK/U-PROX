# Architecture

`apps/web` (React/Vite, TanStack Query, Zustand) connects only to `apps/api` via secure-cookie session and Socket.IO. The Fastify API validates Zod requests, checks RBAC, rate-limits controls, invokes the U-PROX adapter, persists Prisma/PostgreSQL audit records, and broadcasts normalized events. A worker polls/reconnects to U-PROX and deduplicates events by upstream ID + timestamp. Use percentages for map coordinates.

| Role | Plans/events | Controls | Integration/editor | Diagnostics |
|---|---|---|---|---|
| ADMIN | yes | yes | yes | yes |
| SECURITY_OPERATOR | yes | allowed doors | no | no |
| TECHNICIAN | yes | outputs only | no | yes |
| VIEWER | read-only | no | no | no |
