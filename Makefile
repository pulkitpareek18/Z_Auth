SHELL := /bin/zsh

.PHONY: up-dev up-prod down test-e2e test-e2e-down release rollback restart logs

up-dev:
	npm run up-dev

up-prod:
	npm run up-prod

down:
	npm run down

test-e2e:
	npm run test-e2e

test-e2e-down:
	npm run test-e2e:down

release:
	./scripts/release.sh

rollback:
	./scripts/rollback.sh

restart:
	./scripts/restart_prod.sh

logs:
	COMPOSE_PROJECT_NAME=zauth_prod docker compose -f docker/compose.base.yml -f docker/compose.prod.yml --env-file env/.env.prod logs -f
