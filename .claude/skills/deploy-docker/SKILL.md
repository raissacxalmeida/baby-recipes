---
name: deploy-docker
description: Use after finishing any implementation in baby-recipes (feature, fix, screen, server or database change) once tests and the build pass, so the Docker container runs the new code. Also use when asked to rebuild, redeploy or restart the app container.
---

# Deploying to Docker

## Overview

This is the local development deploy. After every finished implementation, rebuild the app container so the running site matches the code. Do it without being asked.

## Steps

1. **Check first:** the full test suite and `npm run build` pass. Never deploy over a red test or a failing build.
2. **Run** `bash .claude/skills/deploy-docker/scripts/deploy.sh`. Allow a few minutes; the image build is slow.
3. **Report the outcome plainly:** healthy at which address, and whether a backup was taken (it is only taken when `src/server/`, `compose.yaml`, `Dockerfile` or the `package*.json` files changed).
4. **If it fails**, the script prints the app logs and leaves the broken container running on purpose. Use superpowers:systematic-debugging on those logs, fix, and run the script again. Do not roll back.

`bash .claude/skills/deploy-docker/scripts/deploy.sh --plan` only says whether a backup would be taken.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | App is healthy |
| 1 | Backup failed (app not rebuilt), or the container is unhealthy or exited |
| 2 | Preflight: Docker not running, or `.env` missing or incomplete |

## Rules

- Never run `docker compose down -v`, `docker volume rm` or anything else that deletes `pgdata`. It holds all the data.
- Never skip or work around a failed backup. A failed backup means the app was not rebuilt; tell the user.
- Rebuild only the `app` service. The script already does this.
- This is for the local machine only: no production, remote hosts or rollback.
