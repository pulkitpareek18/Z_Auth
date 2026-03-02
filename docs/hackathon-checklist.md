# Hackathon Checklist

## One day before

- [ ] DNS records point to VPS for all five subdomains.
- [ ] DNS records point to VPS for auth, verify, api, console, demo, notes, status subdomains.
- [ ] TLS certs issued by Caddy (`docker logs zauth-caddy`).
- [ ] `make release` succeeds.
- [ ] Smoke checks pass (`./scripts/smoke.sh`).
- [ ] Demo client pre-created (`demo-web-client`).
- [ ] One backup created (`./scripts/backup_postgres.sh`).

## Demo day runbook

- [ ] Check `status.geturstyle.shop`.
- [ ] Confirm auth health endpoint.
- [ ] Confirm notes app and verify host resolve over HTTPS.
- [ ] Start demo from clean browser profile.
- [ ] Run QR phone verification flow on auth page.
- [ ] Complete consent and callback.
- [ ] Log in to notes app and create/update/delete a note.
- [ ] Show admin audit timeline.

## Recovery actions

- [ ] Restart stack: `docker compose -f docker/compose.base.yml -f docker/compose.prod.yml --env-file env/.env.prod restart`
- [ ] Rollback images: `PREVIOUS_CORE_IMAGE=... PREVIOUS_UI_IMAGE=... make rollback`
