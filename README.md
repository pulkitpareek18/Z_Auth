# Z_Auth

Dockerized OAuth/OIDC identity platform with Pramaan-style decentralized identity primitives.

## Services

- `zauth-core`: OAuth/OIDC server, passkey auth, Pramaan identity APIs, admin APIs, audit chain.
- `zauth-ui`: Demo shell, admin console, status dashboard.
- `zauth-notes`: Real relying-party notes app integrated with Z_Auth OAuth.
- `postgres`: transactional store.
- `redis`: cache/session/challenge state.
- `caddy` (prod): reverse proxy + Let's Encrypt TLS.

## Subdomains

- `auth.geturstyle.shop` -> `zauth-core`
- `verify.geturstyle.shop` -> `zauth-core`
- `api.geturstyle.shop` -> `zauth-core`
- `console.geturstyle.shop` -> `zauth-ui`
- `demo.geturstyle.shop` -> `zauth-ui`
- `notes.geturstyle.shop` -> `zauth-notes`
- `status.geturstyle.shop` -> `zauth-ui`

## Quick Start (local)

1. Copy env file:
   ```bash
   cp env/.env.dev.example env/.env.dev
   ```
2. Start development stack:
   ```bash
   make up-dev
   ```
3. Open:
   - `http://localhost:3001` (demo app)
   - `http://localhost:3000/ui/login` (QR phone verification login)
   - `http://localhost:5173` (notes React frontend in dev)
   - `http://localhost:3002` (notes backend APIs/session)

## Key Endpoints

### OIDC

- `GET /.well-known/openid-configuration`
- `GET /.well-known/jwks.json`
- `GET|POST /oauth2/authorize`
- `POST /oauth2/token`
- `POST /oauth2/revoke`
- `GET /oauth2/userinfo`

### Pramaan APIs

- `POST /pramaan/v1/identities/register`
- `POST /pramaan/v1/proof/challenge`
- `POST /pramaan/v1/proof/verify`
- `GET /pramaan/v1/identities/{uid}`
- `POST /pramaan/v2/enrollment/start`
- `POST /pramaan/v2/enrollment/complete`
- `POST /pramaan/v2/proof/challenge`
- `POST /pramaan/v2/proof/submit`
- `GET /pramaan/v2/proof/status?verification_id=...`
- `GET /pramaan/v2/identity/me`

### Admin APIs

- `POST /admin/v1/clients`
- `POST /admin/v1/policies`
- `GET /admin/v1/audit-events`

### Liveness + Handoff APIs

- `POST /auth/handoff/start`
- `GET /auth/handoff/status?handoff_id=...`
- `POST /auth/handoff/approve`
- `POST /auth/handoff/deny`
- `POST /auth/liveness/challenge`
- `POST /auth/liveness/verify`

### Health

- `/health/live`
- `/health/ready`
- `/health/deps`

## Environment Strategy

- `dev`: `docker/compose.dev.yml` with hot reload, local ports, Mailpit, webhook mock.
- `test`: `docker/compose.test.yml` ephemeral CI stack.
- `prod`: `docker/compose.prod.yml` with Caddy, health checks, read-only app filesystems.

## CI/CD

Workflows:

- `.github/workflows/ci-pr.yml`
- `.github/workflows/ci-main.yml`
- `.github/workflows/deploy-prod.yml`
- `.github/workflows/deploy-demo.yml`

Required GitHub secrets:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_DEPLOY_PATH`
- `PROD_ENV_FILE`
- `CADDY_EMAIL`
- `GHCR_PAT`

## Deploy on Azure VPS

1. DNS A records for all subdomains -> VPS public IP.
2. Open inbound ports `80`, `443`, `22` in Azure NSG.
3. Install Docker + Docker Compose plugin on VPS.
4. Clone repo to `${VPS_DEPLOY_PATH}`.
5. Add `env/.env.prod` values.
6. Run:
   ```bash
   make release
   ```

## Backups and Restore

Nightly backup (cron):

```bash
./scripts/backup_postgres.sh
```

Restore:

```bash
./scripts/restore_postgres.sh backup_YYYYMMDD_HHMMSS.sql.gz
```

Restart production quickly:

```bash
./scripts/restart_prod.sh
```

## Demo Script (Hackathon)

1. Open `demo.geturstyle.shop`.
2. Click **Sign In With Z_Auth**.
3. Complete passkey registration/login at `auth.geturstyle.shop`.
4. Approve consent.
5. Return to demo callback and show token + userinfo.
6. Open `notes.geturstyle.shop`, log in via Z_Auth, and create notes.
7. Open `console.geturstyle.shop` and show audit log updates.
8. Open `status.geturstyle.shop` for live health panel.

## Notes

- Passkeys use WebAuthn and do not store biometric templates server-side.
- ZK verifier supports `mock` mode for CI/demo and `real` mode for Circom/snarkjs proofs.
- First-time users can create their account directly from phone approval via **Create Z_Auth ID** (register passkey + bootstrap identity).
- Primary UX is QR phone verification with mobile liveness challenge and passkey-backed approval.
- Audit events include append-only hash chaining for tamper evidence.
- Optional daily commitment anchoring writes Merkle roots to `anchor_batches` with chain/IPFS references.
- This is modular-monolith-first for 2 vCPU/8GB VPS constraints.
