<p align="center">
  <img src="apps/zauth-core/assets/zauth-logo.svg" alt="Z Auth" width="80" height="80" />
</p>

<h1 align="center">Z Auth</h1>

<p align="center">
  <strong>Privacy-first identity platform with zero-knowledge biometric authentication</strong>
</p>

<p align="center">
  <a href="https://github.com/pulkitpareek18/Z_Auth/actions/workflows/ci-main.yml"><img src="https://github.com/pulkitpareek18/Z_Auth/actions/workflows/ci-main.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/pulkitpareek18/Z_Auth/releases"><img src="https://img.shields.io/github/v/release/pulkitpareek18/Z_Auth?color=blue" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License" /></a>
  <a href="https://auth.geturstyle.shop/.well-known/openid-configuration"><img src="https://img.shields.io/badge/OIDC-Compliant-green.svg" alt="OIDC" /></a>
</p>

<p align="center">
  <em>Indian Patent Granted &bull; Application No. 202311041001 &bull; US Patent Filed</em>
</p>

---

Z Auth combines WebAuthn passkeys, face-based liveness verification, and Groth16 zero-knowledge proofs into a fully standards-compliant OpenID Connect provider. Raw biometric data never leaves the user's device — the server receives only irreversible cryptographic commitments and verifiable proofs.

> **Pramaan** (Sanskrit: proof/evidence) is the identity verification protocol at the heart of Z Auth.

## Key Features

- **Zero-Knowledge Biometric Proofs** — Real Groth16 circuits (Circom + snarkjs) prove identity without revealing biometric data. The server verifies a Poseidon commitment, never the face itself.
- **Client-Side Face Matching** — Face embeddings are extracted, quantized, and matched entirely in the browser via face-api.js. Only a SHA-256 hash of the quantized embedding is transmitted.
- **WebAuthn Passkeys** — FIDO2 discoverable credentials eliminate passwords. No server-side secrets, no phishing vectors.
- **Standards-Compliant OIDC** — Full OAuth 2.0 Authorization Code flow with PKCE (S256), token refresh, revocation, and a signed JWKS endpoint.
- **Blockchain Audit Anchoring** — Hash-chained audit events with optional Merkle root anchoring to Polygon and metadata pinning to IPFS.
- **Single-VPS Deployment** — Runs on a single 2 vCPU / 8 GB VM behind Caddy with automatic TLS.

## How It Works

```
User Device                           Z Auth Server                   Blockchain
┌──────────────────┐                 ┌──────────────────┐            ┌──────────┐
│ 1. Face capture   │                │                  │            │          │
│ 2. Client-side    │  SHA-256 hash  │ Verify biometric │  Merkle   │ Polygon  │
│    embedding +    ├───────────────>│ commitment       │  root     │ Amoy     │
│    face matching  │                │                  ├──────────>│ Contract │
│ 3. Groth16 proof  │  ZK proof +   │ groth16.verify() │            │          │
│    generation     │  public signals│ Poseidon check   │  Metadata │          │
│ 4. Passkey sign   ├───────────────>│                  ├──────────>│ IPFS     │
│                   │                │ Issue OIDC tokens│            │ (Pinata) │
│                   │<───────────────┤                  │            │          │
└──────────────────┘  access_token   └──────────────────┘            └──────────┘
                      id_token
```

**Privacy invariant**: Raw biometric descriptors never leave the user's device. The server receives only:

| Data | Purpose | Reversible? |
|------|---------|-------------|
| `biometric_hash` | SHA-256 of quantized face embedding | No |
| `zk_proof` | Groth16 proof binding biometric to challenge | No |
| `public_signals` | Poseidon commitment + challenge binding | No |
| `passkey_assertion` | WebAuthn signature from secure enclave | No |

## Architecture

```
apps/
├── zauth-core/              # OAuth/OIDC server + Pramaan V2 identity engine
│   ├── src/routes/          # OIDC, Pramaan, WebAuthn, admin, liveness endpoints
│   ├── src/services/        # ZK verification, passkey, sessions, audit, anchoring
│   ├── zk/                  # Groth16 circuit artifacts
│   │   ├── biometric_commitment.circom    # Poseidon(preimage) + challenge binding
│   │   ├── biometric_commitment.wasm      # Client-side witness generator
│   │   ├── circuit_final.zkey             # Proving key (client-side)
│   │   └── verification_key.json          # Verification key (server-side)
│   ├── contracts/           # ZAuthAnchor.sol — Polygon Amoy smart contract
│   └── assets/              # Static assets (logo, fonts)
├── zauth-ui/                # Admin console + status dashboard
└── zauth-notes/             # Reference relying-party app (OAuth client)

packages/
└── sdk/                     # @zauth/sdk — OIDC client library

docker/
├── compose.base.yml         # Service definitions (Postgres 16, Redis 7, apps)
├── compose.dev.yml          # Hot reload, local ports, debug logging
├── compose.prod.yml         # Caddy TLS, health checks, read-only FS
└── compose.test.yml         # Ephemeral CI stack
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Authentication** | WebAuthn / FIDO2 passkeys (`@simplewebauthn/server`) |
| **Biometrics** | face-api.js (client-side only), SHA-256 commitments |
| **Zero-Knowledge** | Circom 2.1.9, Groth16 via snarkjs, Poseidon hash |
| **Identity Protocol** | OAuth 2.0 / OpenID Connect with PKCE S256 |
| **Blockchain** | Polygon Amoy, Solidity 0.8.24, ethers.js v6 |
| **Storage** | IPFS via Pinata REST API |
| **Backend** | Node.js 20, Express, TypeScript |
| **Database** | PostgreSQL 16 (append-only audit model) |
| **Cache** | Redis 7 (sessions, challenges, handoff state) |
| **Reverse Proxy** | Caddy 2 (automatic TLS via Let's Encrypt) |
| **CI/CD** | GitHub Actions, GHCR images, Trivy vulnerability scanning |

## Quick Start

```bash
# Clone and configure
git clone https://github.com/pulkitpareek18/Z_Auth.git
cd Z_Auth
cp env/.env.dev.example env/.env.dev

# Start the development stack
make up-dev

# Services available at:
#   Auth server   → http://localhost:3000/ui/login
#   Demo app      → http://localhost:3001
#   Notes app     → http://localhost:5173
```

## Live Instance

| Service | URL |
|---------|-----|
| **Auth Server** | [auth.geturstyle.shop](https://auth.geturstyle.shop) |
| **Notes App** | [notes.geturstyle.shop](https://notes.geturstyle.shop) |
| **Admin Console** | [console.geturstyle.shop](https://console.geturstyle.shop) |
| **OIDC Discovery** | [auth.geturstyle.shop/.well-known/openid-configuration](https://auth.geturstyle.shop/.well-known/openid-configuration) |

## Authentication Flows

### Pramaan V2 — ZK Biometric Authentication (AAL2)

```
Desktop                    Phone                      Server
  │                          │                          │
  ├─ POST /auth/handoff/start ─────────────────────────>│
  │<── QR code + handoff_id ────────────────────────────┤
  │        │                                            │
  │   Scan QR                                           │
  │        ├─ Face liveness challenge ─────────────────>│
  │        │<── [blink, turn_left, turn_right] ─────────┤
  │        ├─ Liveness frames ─────────────────────────>│
  │        ├─ Passkey assertion ───────────────────────>│
  │        ├─ Groth16 proof + public signals ──────────>│
  │        ├─ POST /auth/handoff/approve ──────────────>│
  │        │                                            │
  │ ← Poll (approved) → session + consent redirect ────┤
```

### Passkey-Only Login (AAL1)

Direct WebAuthn authentication for lower-assurance contexts.

### Account Recovery

1. Enter one of eight recovery codes generated at enrollment
2. Verify biometric commitment or provide three-of-eight codes
3. Old passkeys revoked, new passkey + recovery codes issued

## API Reference

### OIDC Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/.well-known/openid-configuration` | Discovery document |
| `GET` | `/.well-known/jwks.json` | JSON Web Key Set |
| `GET` `POST` | `/oauth2/authorize` | Authorization endpoint (PKCE S256) |
| `POST` | `/oauth2/token` | Token exchange |
| `POST` | `/oauth2/revoke` | Token revocation |
| `GET` | `/oauth2/userinfo` | User claims (`sub`, `acr`, `amr`, `uid`, `did`) |

### Pramaan V2 Identity

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/pramaan/v2/enrollment/start` | Begin identity enrollment |
| `POST` | `/pramaan/v2/enrollment/complete` | Finalize with ZK proof |
| `POST` | `/pramaan/v2/proof/challenge` | Request authentication challenge |
| `POST` | `/pramaan/v2/proof/submit` | Submit Groth16 proof for verification |
| `GET` | `/pramaan/v2/identity/me` | Current identity context |

### Liveness & Handoff

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/handoff/start` | Initiate QR cross-device handoff |
| `GET` | `/auth/handoff/status` | Poll handoff state |
| `POST` | `/auth/handoff/approve` | Phone-side approval |
| `POST` | `/auth/liveness/challenge` | Start liveness challenge |
| `POST` | `/auth/liveness/verify` | Submit liveness result |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health/live` | Liveness probe |
| `GET` | `/health/ready` | Readiness (DB + Redis) |
| `GET` | `/health/deps` | Dependency status |

## SDK

```typescript
import { ZAuthClient } from "@zauth/sdk";

const client = new ZAuthClient({
  issuer: "https://auth.geturstyle.shop",
  clientId: "my-app",
  redirectUri: "https://myapp.com/callback",
  scopes: ["openid", "profile", "zauth.identity"],
});

// Start authorization flow
const { url, state, codeVerifier } = await client.authorize();
window.location.href = url;

// Handle callback
const { code } = client.parseCallback(window.location.search);
const tokens = await client.exchangeCode(code, codeVerifier);
const user = await client.getUserInfo(tokens.access_token);
// → user.sub, user.uid, user.did, user.acr, user.amr
```

## Security Model

| Property | Implementation |
|----------|---------------|
| **No biometric templates server-side** | Face matching is client-side only; server stores SHA-256 hashes |
| **Zero-knowledge identity proofs** | Groth16 circuit with Poseidon commitment binding |
| **No passwords** | WebAuthn discoverable credentials (passkeys) |
| **Tamper-evident audit trail** | SHA-256 hash-chained events, blockchain-anchorable |
| **Nullifier-based consumption** | Recovery codes and proof requests use insert-only nullifiers |
| **PKCE S256 enforced** | All OAuth flows require proof key for code exchange |
| **Container hardening** | Read-only filesystem, memory limits, Trivy scanning |
| **CSP + Helmet** | Strict Content Security Policy with form-action restrictions |

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the full threat model.

## Deployment

### Production (Single VPS)

```bash
# 1. Point DNS A records for all subdomains → VPS IP
# 2. Configure firewall
make vps-setup

# 3. Deploy
make release
```

### Environment Strategy

| Environment | Compose File | Features |
|-------------|--------------|----------|
| `dev` | `compose.dev.yml` | Hot reload, local ports, debug logging |
| `test` | `compose.test.yml` | Ephemeral CI stack, integration tests |
| `prod` | `compose.prod.yml` | Caddy TLS, health checks, read-only FS |

## CI/CD

| Workflow | Trigger | Actions |
|----------|---------|---------|
| `ci-pr.yml` | Pull request | Lint, type-check, test, build, Trivy scan |
| `ci-main.yml` | Push to main | Full test suite, build, security scan |
| `deploy-prod.yml` | Push to main | Build GHCR images, deploy to VPS, smoke test |

## Blockchain Anchoring

Identity commitments are batched on a configurable interval (default: 24 hours):

1. Collect new identity commitments since the last batch
2. Build a Merkle tree from commitment roots and the latest audit hash
3. Submit the Merkle root to `ZAuthAnchor.sol` on Polygon Amoy
4. Pin batch metadata to IPFS via Pinata
5. Store the batch record with transaction hash and IPFS CID

Contract: [`0xAF5EA0320B7e9Ef0b5A8f6307d73af8652A03c52`](https://amoy.polygonscan.com/address/0xAF5EA0320B7e9Ef0b5A8f6307d73af8652A03c52)

## Patent

| | |
|---|---|
| **Indian Patent** | Granted — Application No. 202311041001 |
| **US Patent** | Filed |
| **Title** | *A system for performing person identification using biometric data and zero-knowledge proof in a decentralized network* |
| **Applicant** | Yushu Excellence Technologies Private Limited |

## License

[Apache License 2.0](LICENSE)
