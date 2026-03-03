# Z_Auth / Pramaan -- Security Threat Model

> **Version:** 1.0
> **Last Updated:** 2026-03-03
> **Classification:** Public
> **Maintainer:** Yushu Excellence Technologies Private Limited

---

## Table of Contents

1. [Overview](#overview)
2. [Biometric Data Architecture](#biometric-data-architecture)
3. [Zero-Knowledge Proof Pipeline](#zero-knowledge-proof-pipeline)
4. [WebAuthn/Passkey Security](#webauthnpasskey-security)
5. [Blockchain Anchoring](#blockchain-anchoring)
6. [Session & Token Security](#session--token-security)
7. [Audit Chain](#audit-chain)
8. [Recovery Flow Security](#recovery-flow-security)
9. [Network & Infrastructure](#network--infrastructure)
10. [OWASP Top 10 Mitigations](#owasp-top-10-mitigations)
11. [Patent Reference](#patent-reference)

---

## Overview

Z_Auth (branded as **Pramaan**) is a privacy-first, decentralized identity platform that combines biometric verification, zero-knowledge proofs, WebAuthn/passkeys, and blockchain anchoring to deliver strong authentication without exposing sensitive user data. This document enumerates the threat surface, architectural safeguards, and compliance posture across every layer of the system.

---

## Biometric Data Architecture

### Design Principles

Biometric data is treated as the most sensitive category of personal information. The architecture enforces a strict **device-only** processing model to ensure that raw biometric data never traverses the network.

### How It Works

1. **On-device extraction** -- Face embeddings are computed as `Float32Array(128)` vectors using [face-api.js](https://github.com/justadudewhohacks/face-api.js) running entirely within the user's browser.
2. **Client-side matching** -- Face matching is performed on the client device using Euclidean distance with a threshold of `< 0.6`. The server is never involved in biometric comparison.
3. **Irreversible commitment** -- The server stores only:
   ```
   biometric_hash = SHA-256(quantized_face_descriptor)
   ```
   This is a one-way cryptographic commitment. The quantized descriptor is hashed before transmission; the raw floating-point embedding is discarded on the client immediately after hashing.
4. **No raw biometric storage** -- Raw biometric data (images, embeddings, descriptors) **never leaves the device**. The server has no access to facial geometry, pixel data, or distance vectors.

### Threat Mitigations

| Threat | Mitigation |
|--------|-----------|
| Database breach exposes biometric data | Stored `SHA-256` hashes cannot reconstruct facial features. Pre-image resistance of SHA-256 (2^256 brute-force cost) makes reversal computationally infeasible. |
| Man-in-the-middle capture of biometrics | Only the hash is transmitted, over TLS. Even if intercepted, the hash reveals nothing about the face. |
| Server-side insider threat | Server operators have no access to raw biometric data -- only irreversible hashes. |
| Replay of biometric hash | Challenge binding (see ZKP section) prevents reuse of captured hashes. |

### Regulatory Compliance

- **GDPR Article 9** -- Biometric data is classified as a "special category" of personal data. Z_Auth satisfies the requirement by ensuring biometric processing occurs exclusively on-device and only an irreversible hash is stored server-side.
- **BIPA (Illinois Biometric Information Privacy Act)** -- No biometric identifiers or biometric information (as defined under 740 ILCS 14/) are collected, stored, or transmitted by the server.
- **CCPA Biometric Provisions** -- The system does not sell, share, or retain biometric information as defined by the California Consumer Privacy Act. The on-device processing model ensures no biometric data enters the server's data inventory.

---

## Zero-Knowledge Proof Pipeline

### Architecture

The ZKP subsystem allows users to prove possession of a valid biometric commitment without revealing the underlying biometric data.

1. **Circom circuit** -- The circuit `biometric_commitment.circom` implements a Groth16-compatible arithmetic circuit that accepts:
   - **Private inputs:** quantized face descriptor, user salt
   - **Public inputs:** biometric hash commitment, challenge nonce
2. **Client-side proving** -- The prover executes entirely on the user's device. Private inputs (the face descriptor and salt) are **never transmitted** to the server.
3. **Server-side verification** -- The server verifies the Groth16 proof using only the verification key and public inputs. It learns nothing about the private inputs beyond the fact that they satisfy the circuit constraints.

### Threat Mitigations

| Threat | Mitigation |
|--------|-----------|
| Proof replay attack | Each proof is bound to a server-issued challenge with a **5-minute TTL**. Replayed proofs fail challenge validation. |
| Proof forgery | Groth16 proofs are computationally sound under the Knowledge of Exponent assumption on BN128. Forging a proof without the private witness is infeasible. |
| Curve incompatibility / field overflow | BN128 scalar field masking is applied to ensure all circuit signals remain within the valid scalar field, preventing overflow or undefined behavior. |
| Witness extraction from proof | Zero-knowledge property of Groth16 guarantees that the proof reveals no information about the private witness beyond the truth of the statement. |

---

## WebAuthn/Passkey Security

### Architecture

Z_Auth uses the WebAuthn (FIDO2) standard for passwordless, phishing-resistant authentication.

1. **Discoverable credentials** -- Registration creates resident (discoverable) credentials on the user's authenticator, enabling usernameless login flows.
2. **Public key only on server** -- The server stores only the public key portion of the credential. No shared secrets, no passwords, no symmetric keys.
3. **Clone detection** -- A signature counter is tracked with each authentication ceremony. If the counter does not increment as expected, credential cloning is flagged.
4. **User verification enforced** -- The `userVerification: "required"` flag ensures the authenticator performs local user verification (PIN, fingerprint, face) before signing the challenge.

### Threat Mitigations

| Threat | Mitigation |
|--------|-----------|
| Phishing | WebAuthn binds credentials to the origin (RP ID). Credentials cannot be used on a phishing domain. |
| Credential theft from server | Only public keys are stored. Stolen public keys are useless without the corresponding private key locked in the authenticator hardware. |
| Credential cloning | Counter tracking detects cloned authenticators. A counter mismatch triggers forced re-registration. |
| Session fixation via WebAuthn | Origin and RP ID validation prevent cross-origin credential use. |

---

## Blockchain Anchoring

### Architecture

Identity commitments are anchored to a public blockchain to provide an immutable, independently verifiable record of identity events.

1. **Batching** -- Identity commitments are collected over a 24-hour window and assembled into a Merkle tree.
2. **Merkle root anchoring** -- The Merkle root is submitted to the **Polygon Amoy** testnet via the `ZAuthAnchor.sol` smart contract.
3. **IPFS metadata** -- The full batch metadata (commitment list, timestamps, Merkle proofs) is pinned to IPFS through **Pinata**, creating a content-addressed, tamper-evident record.
4. **Graceful degradation** -- If the blockchain network or IPFS gateway is unavailable, the system falls back to generating pseudo-hashes locally. These are flagged for later reconciliation when connectivity is restored.
5. **Access control** -- The `ZAuthAnchor.sol` contract enforces **owner-only write access**. Only the authorized deployer address can submit new Merkle roots.

### Threat Mitigations

| Threat | Mitigation |
|--------|-----------|
| Tampering with historical identity records | Merkle root on-chain is immutable. Any modification to the underlying data will produce a different root, detectable by any verifier. |
| Unauthorized anchor submission | Owner-only modifier on the smart contract prevents unauthorized writes. |
| IPFS data loss | Pinata pinning ensures persistence. Multiple IPFS gateways can serve the data. Content addressing (CID) guarantees integrity. |
| Chain unavailability | Graceful fallback to pseudo-hashes with deferred anchoring. No authentication flow is blocked by chain downtime. |

---

## Session & Token Security

### Architecture

Session management follows a server-side model with no sensitive tokens stored on the client.

1. **Server-side sessions** -- All session state is stored in **Redis** with an **8-hour TTL**. The client receives only an opaque session identifier.
2. **PKCE (S256)** -- The OAuth 2.0 authorization code flow uses Proof Key for Code Exchange with the S256 challenge method, preventing authorization code interception attacks.
3. **Token revocation** -- Tokens can be explicitly revoked, immediately invalidating associated sessions in Redis.
4. **Auth code constraints** -- Authorization codes are single-use and expire after **5 minutes**.
5. **ACR/AMR claims** -- Tokens carry Authentication Context Reference (ACR) and Authentication Methods Reference (AMR) claims, enabling relying parties to enforce minimum assurance levels.

### Threat Mitigations

| Threat | Mitigation |
|--------|-----------|
| Session hijacking | Sessions are server-side (Redis). No session tokens with exploitable payloads are stored on the client. |
| Authorization code interception | PKCE S256 binds the code to the original client, rendering intercepted codes useless. |
| Token replay | Token revocation and Redis TTL ensure expired or revoked tokens are immediately rejected. |
| Privilege escalation | ACR/AMR claims enforce authentication strength requirements. A session authenticated with a weaker method cannot access resources requiring a stronger method. |

---

## Audit Chain

### Architecture

The audit subsystem implements a cryptographic hash chain that provides tamper-evident, append-only logging of all security-critical events.

1. **Hash-chained event log** -- Each audit event includes the SHA-256 hash of the previous event, forming a linked list. Modifying any event breaks the chain from that point forward.
   ```
   event[n].prev_hash = SHA-256(event[n-1])
   ```
2. **Tamper evidence** -- Any modification to a historical event is detectable by recomputing the hash chain and identifying the break point.
3. **Blockchain anchorability** -- Audit events can be batched into Merkle trees and anchored on-chain using the same pipeline as identity commitments, providing an external trust anchor for the audit trail.
4. **Immutable records** -- Security-critical tables use a nullifier-based consumption model. Records are never updated or deleted; instead, new records are appended with nullifiers that mark previous records as consumed.

### Threat Mitigations

| Threat | Mitigation |
|--------|-----------|
| Log tampering by insiders | Hash chain makes any modification detectable. Broken chain links are flagged during integrity verification. |
| Log deletion | Append-only model with no UPDATE/DELETE on security-critical tables. Nullifier-based consumption preserves full history. |
| Disputed audit trail | Blockchain-anchored Merkle roots provide an independent, publicly verifiable timestamp for audit batches. |
| Selective log omission | Chain continuity checks detect gaps. Missing events break the hash chain. |

---

## Recovery Flow Security

### Architecture

Account recovery is designed to balance usability with security, avoiding single points of failure while maintaining the zero-knowledge property.

1. **Recovery code generation** -- During enrollment, **8 recovery codes** are generated. Each code is hashed as:
   ```
   SHA-256(subject_id : code : tenant_salt)
   ```
   Only the hashes are stored server-side. The plaintext codes are shown to the user once and never stored.
2. **Multi-code threshold** -- When biometric verification is unavailable, the user must present **3 of 8** recovery codes to authenticate. This threshold balances security (attacker must compromise multiple codes) with usability (user can lose up to 5 codes).
3. **Generation versioning** -- When new recovery codes are generated, previous code hashes are retained but marked as superseded (not deleted). This preserves the audit trail while preventing use of old codes.
4. **Nullifier-based consumption** -- Used recovery codes are consumed via a nullifier model that mirrors on-chain nullifier sets. A consumed code cannot be reused, and the consumption event is recorded in the audit chain.
5. **Append-only credential revocation** -- Credential revocation events are append-only. Revoked credentials are never deleted from the database; they are marked with a revocation timestamp and reason.

### Threat Mitigations

| Threat | Mitigation |
|--------|-----------|
| Recovery code brute force | SHA-256 hashing with tenant salt makes offline brute-force impractical. Rate limiting on recovery endpoints prevents online brute-force. |
| Single recovery code compromise | 3-of-8 threshold requires the attacker to compromise multiple codes. |
| Recovery code reuse | Nullifier-based consumption ensures each code can only be used once. |
| Old recovery code exploitation | Generation versioning supersedes old codes. Only the current generation is valid for recovery. |

---

## Network & Infrastructure

### Architecture

The deployment infrastructure enforces defense-in-depth across the network, host, and container layers.

1. **Reverse proxy** -- **Caddy** serves as the reverse proxy with automatic TLS provisioning via Let's Encrypt. All HTTP traffic is redirected to HTTPS.
2. **Firewall** -- **UFW (Uncomplicated Firewall)** restricts inbound traffic to only the necessary ports (80, 443, SSH).
3. **Brute-force protection** -- **fail2ban** monitors authentication endpoints and bans IPs exhibiting brute-force patterns.
4. **Container hardening** -- Production containers run with:
   - **Read-only root filesystems** -- Prevents runtime modification of container contents.
   - **Memory and CPU limits** -- Prevents resource exhaustion attacks (fork bombs, memory leaks).
5. **Rate limiting** -- Authentication endpoints enforce per-IP and per-user rate limits to prevent credential stuffing and denial-of-service attacks.

### Threat Mitigations

| Threat | Mitigation |
|--------|-----------|
| TLS stripping / downgrade | Caddy enforces HTTPS with automatic certificate renewal. HSTS headers prevent downgrade attacks. |
| Brute-force authentication attacks | fail2ban bans offending IPs. Rate limiting caps request volume per IP and per user. |
| Container escape / modification | Read-only filesystems prevent runtime tampering. Resource limits contain blast radius. |
| Port scanning / unauthorized access | UFW whitelists only required ports. All other inbound traffic is dropped. |

---

## OWASP Top 10 Mitigations

The following table maps each OWASP Top 10 (2021) category to the specific mitigations implemented in Z_Auth.

| # | OWASP Category | Z_Auth Mitigation |
|---|---------------|-------------------|
| A01 | **Broken Access Control** | Owner-only modifier on `ZAuthAnchor.sol` smart contract. Session-based authorization with ACR/AMR enforcement. No direct object references exposed. |
| A02 | **Cryptographic Failures** | No raw biometrics stored. All sensitive data hashed with SHA-256. TLS enforced on all endpoints via Caddy. |
| A03 | **Injection** | All database queries use parameterized queries via the `pg` driver. All user input is validated with **Zod** schemas before processing. |
| A04 | **Insecure Design** | Threat model maintained (this document). Zero-knowledge architecture ensures server never has access to sensitive biometric data. |
| A05 | **Security Misconfiguration** | Docker containers include health checks. Environment variables validated at startup via Zod schemas. No default credentials. |
| A06 | **Vulnerable and Outdated Components** | **Trivy** container scanning integrated into the CI pipeline. Dependency vulnerability scanning on every build. |
| A07 | **Identification and Authentication Failures** | WebAuthn eliminates passwords entirely. Session management via Redis with strict TTLs. PKCE prevents authorization code interception. |
| A08 | **Software and Data Integrity Failures** | Hash-chained audit log detects tampering. Blockchain-anchored Merkle roots provide external integrity verification. Nullifier-based consumption prevents record manipulation. |
| A09 | **Security Logging and Monitoring Failures** | Append-only hash-chained audit events capture all security-critical operations. Chain integrity is verifiable at any time. |
| A10 | **Server-Side Request Forgery (SSRF)** | No user-controlled URL fetching. External service calls (Polygon RPC, Pinata API) use hardcoded endpoints with allowlisted domains. |

### Additional Mitigations

- **XXE (XML External Entity):** The system performs no XML processing. All APIs are JSON-only.
- **XSS (Cross-Site Scripting):** Server-rendered HTML uses proper output escaping. No raw user input is interpolated into HTML templates.
- **Insecure Deserialization:** All API payloads are JSON with strict Zod schema validation. No native object deserialization is performed.

---

## Patent Reference

The cryptographic identity system implemented by Z_Auth / Pramaan is protected by the following intellectual property:

| Field | Detail |
|-------|--------|
| **Indian Patent** | **GRANTED** |
| **Application No.** | 202311041001 |
| **US Patent** | **FILED** |
| **Title** | "A system for performing person identification using biometric data and zero-knowledge proof in a decentralized network" |
| **Applicant** | Yushu Excellence Technologies Private Limited |

The patent covers the novel combination of on-device biometric processing, zero-knowledge proof generation for biometric commitments, and decentralized blockchain anchoring for identity verification -- the core architectural pillars of the Z_Auth platform.

---

**Copyright 2024-2026 Yushu Excellence Technologies Private Limited. All rights reserved.**

Licensed under the Apache License, Version 2.0. See [LICENSE](../LICENSE) for details.
