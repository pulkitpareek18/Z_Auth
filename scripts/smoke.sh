#!/usr/bin/env bash
set -euo pipefail

AUTH_URL="${AUTH_URL:-https://auth.geturstyle.shop/health/ready}"
DEMO_URL="${DEMO_URL:-https://demo.geturstyle.shop}"
NOTES_URL="${NOTES_URL:-https://notes.geturstyle.shop}"
STATUS_URL="${STATUS_URL:-https://status.geturstyle.shop/status-json}"
AUTH_API_BASE="${AUTH_API_BASE:-https://auth.geturstyle.shop}"

# Wait for Caddy/TLS to be ready (up to 30s)
for i in $(seq 1 15); do
  if curl -fsS --max-time 3 "$AUTH_URL" > /dev/null 2>&1; then
    break
  fi
  echo "Waiting for services to be ready... (attempt $i/15)"
  sleep 2
done

curl -fsS "$AUTH_URL" > /dev/null
curl -fsS "$DEMO_URL" > /dev/null
curl -fsS "$NOTES_URL" > /dev/null
curl -fsS "$STATUS_URL" > /dev/null

session_http_code="$(curl -sS -o /tmp/zauth_notes_session.json -w "%{http_code}" "${NOTES_URL}/api/session")"
if [[ "$session_http_code" != "401" ]]; then
  echo "Notes session smoke failed: expected 401 from /api/session, got ${session_http_code}"
  cat /tmp/zauth_notes_session.json || true
  exit 1
fi

if ! grep -Eq '"login_url"[[:space:]]*:[[:space:]]*"/login"' /tmp/zauth_notes_session.json; then
  echo "Notes session smoke failed: /api/session payload does not include login_url=/login"
  cat /tmp/zauth_notes_session.json || true
  exit 1
fi

if [[ -n "${ZK_SMOKE_UID:-}" ]]; then
  challenge_payload="$(curl -fsS -X POST "${AUTH_API_BASE}/pramaan/v2/proof/challenge" \
    -H "content-type: application/json" \
    -d "{\"uid\":\"${ZK_SMOKE_UID}\",\"purpose\":\"smoke\"}")"

  proof_request_id="$(node -e "const o=JSON.parse(process.argv[1]); process.stdout.write(String(o.proof_request_id||''));" "$challenge_payload")"
  challenge_hash="$(node -e "const o=JSON.parse(process.argv[1]); process.stdout.write(String(o.challenge_hash||''));" "$challenge_payload")"

  if [[ -z "$proof_request_id" || -z "$challenge_hash" ]]; then
    echo "ZK smoke skipped: missing proof challenge fields"
  else
    proof_payload="$(node - "$ZK_SMOKE_UID" "$challenge_hash" "$proof_request_id" <<'NODE'
const crypto = require("node:crypto");
const uid = process.argv[2];
const challengeHash = process.argv[3];
const proofRequestId = process.argv[4];
const sha256 = (input) => crypto.createHash("sha256").update(input).digest("hex");
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
  return out;
};
const publicSignals = canonicalize({
  uid,
  challenge_hash: challengeHash,
  purpose: "smoke"
});
const signalsHash = sha256(JSON.stringify(publicSignals));
const digest = sha256(`${challengeHash}:${signalsHash}:${uid}`);
process.stdout.write(JSON.stringify({
  proof_request_id: proofRequestId,
  uid,
  zk_proof: { digest },
  public_signals: publicSignals
}));
NODE
)"

    proof_submit="$(curl -fsS -X POST "${AUTH_API_BASE}/pramaan/v2/proof/submit" \
      -H "content-type: application/json" \
      -d "$proof_payload")"
    verified="$(node -e "const o=JSON.parse(process.argv[1]); process.stdout.write(String(Boolean(o.verified)));" "$proof_submit")"
    if [[ "$verified" != "true" ]]; then
      echo "ZK smoke failed: ${proof_submit}"
      exit 1
    fi
    echo "ZK smoke passed"
  fi
fi

echo "Smoke checks passed"
