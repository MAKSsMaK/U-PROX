# U-PROX adapter

All calls are server-side and session state remains in the adapter. Known endpoint names are isolated in `apps/api/src/integrations/uproxx/client.ts`. `EventGetList`, `DoorAccessIn`, and `DoorAccessOut` are not wired until request/response shapes are confirmed for the target release. This prevents accidental production simulation or authorization bypass.
