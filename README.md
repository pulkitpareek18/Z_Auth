# Z_Auth (Pramaan)

**Self-hosted, privacy-first identity platform with zero-knowledge biometric authentication.**

Z_Auth combines WebAuthn passkeys, face-based liveness verification, and Groth16 zero-knowledge proofs into a standards-compliant OIDC provider. No biometric data is ever stored server-side — face matching happens entirely on the user's device, and the server receives only irreversible SHA-256 commitments.

**Indian Patent Granted** | Application No. 202311041001 | Applicant: Yushu Excellence Technologies Pvt. Ltd.

---

## Why Z_Auth?

| Problem | Z_Auth Solution |
|---------|-----------------|
| Passwords are phished, leaked, reused | **WebAuthn passkeys** — no passwords, no server-side secrets |
| Biometric systems store sensitive templates on servers | **Client-side face matching** — server stores only SHA-256 hashes, never raw embeddings |
| Identity verification leaks personal data | **Zero-knowledge proofs** — prove identity without revealing biometric data |
| Cloud auth providers can't be self-hosted | **Single-VPS deployment** — full OIDC provider on a 2 vCPU/8GB VM |
| No tamper-evident audit trail | **Hash-chained audit log** with optional blockchain anchoring (Polygon + IPFS) |

## How It Works

```
User Device                           Z_Auth Server                    Blockchain
┌──────────────────┐                 ┌──────────────────┐             ┌──────────┐
│ 1. Face scan      │                │                  │             │          │
│ 2. Embedding      │  biometric_hash│ Verify hash      │  Merkle    │ Polygon  │
│    extraction     ├───────────────>│ commitment       │  root      │ Amoy     │
│ 3. Client-side    │  (SHA-256 only)│                  ├──────────->│ Contract │
│    face matching  │                │ Verify ZK proof  │             │          │
│ 4. ZK proof gen   │  Groth16 proof │ (challenge bound)│  Metadata  │          │
│ 5. Passkey sign   ├───────────────>│                  ├──────────->│ IPFS     │
│                   │                │ Issue OIDC tokens│             │ (Pinata) │
│                   │<───────────────┤                  │             │          │
└──────────────────┘  access_token   └──────────────────┘             └──────────┘
                      id_token
```

**Key principle**: Raw biometric data never leaves the user's device. The server receives only:
- `biometric_hash`: SHA-256 of the quantized face descriptor (irreversible)
- `zk_proof`: Groth16 proof binding the biometric to a server-issued challenge
- `passkey_assertion`: WebAuthn signature from the device's secure enclave

## Architecture

```
apps/
├── zauth-core/          # OAuth/OIDC server + Pramaan identity APIs
│   ├── src/services/    # Passkey, ZK, liveness, anchor, audit services
│   ├── src/routes/      # OIDC, Pramaan, WebAuthn, admin endpoints
│   ├── contracts/       # ZAuthAnchor.sol (Polygon Amoy)
│   └── zk/              # Circom circuits + verification keys
├── zauth-ui/            # Admin console, demo shell, status dashboard
└── zauth-notes/         # Example relying-party app (OAuth client)

packages/
└── sdk/                 # @zauth/sdk — OIDC client SDK for developers

docker/
├── compose.base.yml     # Service definitions (Postgres, Redis, apps)
├── compose.dev.yml      # Hot reload, local ports
├── compose.prod.yml     # Caddy TLS, health checks, read-only FS
└── compose.test.yml     # Ephemeral CI stack
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Authentication** | WebAuthn/FIDO2 passkeys (`@simplewebauthn/server`) |
| **Biometrics** | face-api.js (client-side only), SHA-256 commitments |
| **Zero-Knowledge** | Circom 2.1.9, Groth16 (`snarkjs`), Poseidon hash |
| **Identity Protocol** | OAuth 2.0 / OpenID Connect (PKCE S256 enforced) |
| **Blockchain** | Polygon Amoy, Solidity 0.8.24, ethers.js v6 |
| **IPFS** | Pinata REST API |
| **Backend** | Node.js 20, Express, TypeScript |
| **Database** | PostgreSQL 16 (append-only audit model) |
| **Cache** | Redis 7 (sessions, challenges, handoff state) |
| **Reverse Proxy** | Caddy (auto-TLS via Let's Encrypt) |
| **CI/CD** | GitHub Actions, GHCR, Trivy scanning |

## Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/pulkitpareek18/Z_Auth.git
cd Z_Auth
cp env/.env.dev.example env/.env.dev

# 2. Start development stack
make up-dev

# 3. Open in browser
# Demo app:     http://localhost:3001
# Auth server:  http://localhost:3000/ui/login
# Notes app:    http://localhost:5173
```

## Live Demo

| Service | URL | Description |
|---------|-----|-------------|
| **Auth Server** | `auth.geturstyle.shop` | OAuth/OIDC + Pramaan APIs |
| **Demo App** | `demo.geturstyle.shop` | Interactive auth demo |
| **Notes App** | `notes.geturstyle.shop` | Relying-party example |
| **Admin Console** | `console.geturstyle.shop` | Audit log viewer |
| **Status** | `status.geturstyle.shop` | Health dashboard |

## Demo Script (Hackathon)

1. Open `demo.geturstyle.shop` and click **Sign In With Z_Auth**
2. Scan the QR code with your phone — cross-device handoff begins
3. On phone: complete face liveness challenge (blink, turn)
4. Register passkey (biometric/PIN on device)
5. Zero-knowledge proof generated and verified
6. Consent screen → tokens issued → callback with userinfo
7. Open `notes.geturstyle.shop` — log in with same Z_Auth account
8. Open `console.geturstyle.shop` — view real-time audit chain

## Authentication Flows

### QR Phone Verification (Primary)
```
Desktop                    Phone                      Server
  │                          │                          │
  ├─ POST /auth/handoff/start ──────────────────────────>│
  │<── QR code + handoff_id ─────────────────────────────┤
  │        │                                             │
  │   Scan QR                                            │
  │        ├─ Face liveness challenge ──────────────────>│
  │        │<── sequence: [blink, turn_left, turn_right]─┤
  │        ├─ Liveness result ─────────────────────────>│
  │        ├─ Passkey assertion ───────────────────────>│
  │        ├─ ZK proof + biometric_hash ───────────────>│
  │        ├─ POST /auth/handoff/approve ──────────────>│
  │        │                                             │
  │ ← Poll /auth/handoff/status (approved) ──────────────┤
  │ ← Session cookie + redirect to consent ──────────────┤
```

### Passkey-Only Login (AAL1)
Direct WebAuthn authentication for lower-assurance contexts.

### Account Recovery
1. Enter recovery code (1 of 8 generated at enrollment)
2. Verify biometric commitment OR provide 3-of-8 recovery codes
3. Old passkeys revoked, new passkey registered
4. New recovery codes generated (unless multi-code bypass used)

## API Reference

### OIDC Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/.well-known/openid-configuration` | Discovery document |
| GET | `/.well-known/jwks.json` | Signing keys |
| GET/POST | `/oauth2/authorize` | Authorization (PKCE S256) |
| POST | `/oauth2/token` | Token exchange |
| POST | `/oauth2/revoke` | Token revocation |
| GET | `/oauth2/userinfo` | User claims |

### Pramaan V2 Identity
| Method | Path | Description |
|--------|------|-------------|
| POST | `/pramaan/v2/enrollment/start` | Begin enrollment |
| POST | `/pramaan/v2/enrollment/complete` | Finalize with ZK proof |
| POST | `/pramaan/v2/proof/challenge` | Request auth challenge |
| POST | `/pramaan/v2/proof/submit` | Submit ZK proof |
| GET | `/pramaan/v2/identity/me` | Current identity |

### Liveness + Handoff
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/handoff/start` | Start QR handoff |
| GET | `/auth/handoff/status` | Poll handoff state |
| POST | `/auth/handoff/approve` | Phone approval |
| POST | `/auth/liveness/challenge` | Start liveness |
| POST | `/auth/liveness/verify` | Verify liveness |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness (DB + Redis) |
| GET | `/health/deps` | Dependency status |

## SDK Integration

```typescript
import { ZAuthClient } from "@zauth/sdk";

const client = new ZAuthClient({
  issuer: "https://auth.geturstyle.shop",
  clientId: "my-app",
  redirectUri: "https://myapp.com/callback",
  scopes: ["openid", "profile", "zauth.identity"],
});

// Redirect to login
const { url, state, codeVerifier } = await client.authorize();
window.location.href = url;

// Handle callback
const { code } = client.parseCallback(window.location.search);
const tokens = await client.exchangeCode(code, codeVerifier);
const user = await client.getUserInfo(tokens.access_token);
// user.uid, user.did, user.acr, user.amr available
```

## Security Model

- **No biometric templates server-side** — face matching is client-side only; server stores SHA-256 hashes
- **Zero-knowledge proofs** — identity binding without revealing biometric data (Groth16/Poseidon)
- **WebAuthn passkeys** — FIDO2 discoverable credentials, no passwords
- **Append-only audit chain** — SHA-256 hash-linked events, blockchain-anchorable
- **Nullifier-based consumption** — recovery codes and proof requests use insert-only nullifiers
- **PKCE S256 enforced** — all OAuth flows require proof key
- **Container hardening** — read-only FS, memory limits, Trivy scanning

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the full security threat model.

## Deployment

### Production (Azure VPS)

```bash
# 1. Set up DNS A records for all subdomains → VPS IP
# 2. Configure firewall
make vps-setup

# 3. Deploy
make release
```

### Environment Strategy

| Environment | Compose File | Features |
|------------|-------------|----------|
| `dev` | `compose.dev.yml` | Hot reload, local ports, debug logging |
| `test` | `compose.test.yml` | Ephemeral CI stack, integration tests |
| `prod` | `compose.prod.yml` | Caddy TLS, health checks, read-only FS |

## CI/CD

| Workflow | Trigger | Actions |
|----------|---------|---------|
| `ci-pr.yml` | Pull request | Lint, test, build, Trivy scan |
| `ci-main.yml` | Push to main | Full test suite, build, security scan |
| `deploy-prod.yml` | Manual / main | Build, push GHCR, deploy VPS, smoke test |
| `deploy-demo.yml` | Manual / main | Deploy to demo environment |

## Blockchain Anchoring

Identity commitments are batched every 24 hours:
1. Collect all new identity commitments since last batch
2. Build Merkle tree from commitment roots + latest audit hash
3. Submit Merkle root to `ZAuthAnchor.sol` on Polygon Amoy
4. Pin batch metadata to IPFS via Pinata
5. Store batch record with tx hash + IPFS CID

Contract: [`0xAF5EA0320B7e9Ef0b5A8f6307d73af8652A03c52`](https://amoy.polygonscan.com/address/0xAF5EA0320B7e9Ef0b5A8f6307d73af8652A03c52)

## Patent

- **Indian Patent GRANTED** — Application No. 202311041001
- **US Patent FILED**
- **Title**: "A system for performing person identification using biometric data and zero-knowledge proof in a decentralized network"
- **Applicant**: Yushu Excellence Technologies Private Limited

## License

Apache License 2.0 — see [LICENSE](LICENSE).
