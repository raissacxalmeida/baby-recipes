#!/usr/bin/env bash
# Replaces ALL data in the database with the contents of a backup file.
# Usage: scripts/restore.sh [--yes] backups/babyrecipes-YYYYmmdd-HHMMSS.sql
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=${COMPOSE:-docker compose}
FILE=""
YES=false
for arg in "$@"; do
  case "$arg" in
    --yes) YES=true ;;
    *) FILE="$arg" ;;
  esac
done

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: scripts/restore.sh [--yes] backups/<file>.sql" >&2
  exit 1
fi

if [ "$YES" != true ]; then
  read -r -p "This replaces ALL current data with $FILE. Type yes to continue: " answer
  [ "$answer" = yes ] || { echo "Cancelled." >&2; exit 1; }
fi

{ echo 'drop schema public cascade; create schema public;'; cat "$FILE"; } \
  | $COMPOSE exec -T db psql -v ON_ERROR_STOP=1 -U baby babyrecipes
echo "Restored $FILE"
