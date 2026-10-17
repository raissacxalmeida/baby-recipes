#!/usr/bin/env bash
# Rebuilds and restarts the app container for local development. Run from anywhere.
#   deploy.sh          back up if the server or database could be affected, rebuild, wait for healthy
#   deploy.sh --plan   only say whether a backup would be taken; change nothing
# On an unhealthy app it prints the logs and leaves the container running so it can be debugged.
set -euo pipefail
cd "$(dirname "$0")/../../../.."

COMPOSE=${COMPOSE:-docker compose}
TIMEOUT=${DEPLOY_TIMEOUT:-120}
STATE=.claude/skills/deploy-docker/.last-deploy

# Anything here can change data or how the database starts, so it earns a backup first.
RISKY_PATHS=(src/server compose.yaml Dockerfile package.json package-lock.json)

fingerprint() {
  find "${RISKY_PATHS[@]}" -type f | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256 | cut -d' ' -f1
}

needs_backup() {
  [ ! -f "$STATE" ] || [ "$(cat "$STATE")" != "$1" ]
}

# Prints "healthy", "unhealthy", "exited" or "starting" for a compose service.
service_state() {
  local id
  id=$($COMPOSE ps -q "$1")
  [ -n "$id" ] || { echo exited; return; }
  docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id" | {
    read -r status health
    case "$status/$health" in
      running/healthy) echo healthy ;;
      running/unhealthy) echo unhealthy ;;
      running/*) echo starting ;;
      restarting/*|created/*) echo starting ;;
      *) echo exited ;;
    esac
  }
}

wait_healthy() {
  local service=$1 waited=0 state
  while :; do
    state=$(service_state "$service")
    [ "$state" = healthy ] && return 0
    if [ "$state" = unhealthy ] || [ "$state" = exited ] || [ "$waited" -ge "$TIMEOUT" ]; then
      [ "$state" = starting ] && state="not healthy after ${TIMEOUT}s"
      echo "$service is $state." >&2
      return 1
    fi
    sleep 2
    waited=$((waited + 2))
  done
}

fail_with_logs() {
  echo "--- last lines of $1 logs ---" >&2
  $COMPOSE logs --tail 80 --no-color "$1" >&2 || true
  echo "--- the broken $1 container is still running; debug it, fix, and run this script again ---" >&2
  exit 1
}

NOW=$(fingerprint)

if [ "${1:-}" = "--plan" ]; then
  if needs_backup "$NOW"; then echo "backup: yes"; else echo "backup: no"; fi
  exit 0
fi

# Preflight: fail early with a plain message instead of a compose error.
docker info >/dev/null 2>&1 || { echo "Docker is not running. Start Docker Desktop and retry." >&2; exit 2; }
[ -f .env ] || { echo "No .env file. Copy .env.example to .env and fill it in." >&2; exit 2; }
for key in POSTGRES_PASSWORD OPENAI_API_KEY PUBLIC_URL; do
  grep -Eq "^$key=.+" .env || { echo ".env is missing a value for $key." >&2; exit 2; }
done

if needs_backup "$NOW"; then
  echo "Server or database files changed since the last deploy: backing up first."
  $COMPOSE up -d db
  wait_healthy db || fail_with_logs db
  scripts/backup.sh || { echo "Backup failed, so the app was not rebuilt." >&2; exit 1; }
else
  echo "Only client files changed: skipping the backup."
fi

# Only the app is rebuilt, so the database and its volume stay untouched.
$COMPOSE up -d --build app
wait_healthy app || fail_with_logs app

echo "$NOW" > "$STATE"
$COMPOSE ps
echo "App is healthy at $(grep -E '^PUBLIC_URL=' .env | cut -d= -f2-)"
