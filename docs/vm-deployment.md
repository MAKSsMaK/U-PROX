# VM deployment (one host)

## Prerequisites

- Linux VM with Docker Engine and Docker Compose plugin.
- U-PROX service is already reachable at `http://127.0.0.1:40001` **from the VM host**.
- Do not expose the U-PROX port through Docker or a firewall rule.

## Install

```bash
cd /opt/uproxx-command-center
cp .env.example .env
chmod 600 .env
nano .env
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8080/api/health
```

Set a strong database password and application secret before starting. Set `MOCK_UPROX=false`, the local U-PROX URL, and a least-privilege U-PROX integration account. The dashboard is then available on `http://VM_LAN_IP:8080`.

## Firewall

Allow the dashboard port only from the administrator LAN/VPN. Keep PostgreSQL and U-PROX unbound from external host ports. Put HTTPS and access restrictions in a reverse proxy before allowing use outside a protected internal network.

## Verification

- `GET /api/health` must return `mode: "uproxx"`.
- `GET /api/events` verifies Authenticate + EventGetList server-side.
- Door/output control returns HTTP 501 in real mode until the exact request contract has been verified against the installed U-PROX build. This is a deliberate safety gate.
