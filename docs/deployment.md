# Deployment Guide (Azure VPS + geturstyle.shop)

## 1. DNS records

Create A records to VPS public IP:

- `auth.geturstyle.shop`
- `verify.geturstyle.shop`
- `api.geturstyle.shop`
- `console.geturstyle.shop`
- `demo.geturstyle.shop`
- `notes.geturstyle.shop`
- `status.geturstyle.shop`

## 2. Azure NSG rules

Allow inbound:

- `22/tcp`
- `80/tcp`
- `443/tcp`

## 3. Server bootstrap

```bash
./scripts/vps_setup.sh
```

Then re-login, clone repo, and configure production env:

```bash
cp env/.env.prod.example env/.env.prod
# edit env/.env.prod with strong secrets and GHCR image tags
# ensure ZK and policy flags are set:
# PRAMAAN_V2_ENABLED=true
# AUTH_REQUIRE_ZK_FOR_LOGIN=true
# ZK_VERIFIER_MODE=real
# ZK_VERIFY_KEY_PATH=zk/verification_key.json
# NOTES_REQUIRED_ACR=urn:zauth:aal2:zk
```

## 4. First deployment

```bash
make release
```

## 5. Validate

```bash
curl -fsS https://auth.geturstyle.shop/health/ready
curl -fsS https://demo.geturstyle.shop
curl -fsS https://notes.geturstyle.shop
curl -fsS https://status.geturstyle.shop/status-json
```

## 6. Rollback

```bash
PREVIOUS_CORE_IMAGE=ghcr.io/<org>/zauth-core:<old-tag> \
PREVIOUS_UI_IMAGE=ghcr.io/<org>/zauth-ui:<old-tag> \
PREVIOUS_NOTES_IMAGE=ghcr.io/<org>/zauth-notes:<old-tag> \
make rollback
```
