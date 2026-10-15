#!/usr/bin/env bash
# Replaces ALL data in the database with the contents of a backup file.
# A safety copy of the current data is saved first. Stop the app before restoring.
# Usage: scripts/restore.sh [--yes] backups/babyrecipes-YYYYmmdd-HHMMSS.sql
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

COMPOSE=${COMPOSE:-docker compose}
DIR=${BACKUP_DIR:-backups}
STAMP=${BACKUP_TIMESTAMP:-$(date +%Y%m%d-%H%M%S)}
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

mkdir -p "$DIR"
SAFETY="$DIR/pre-restore-$STAMP.sql"
if ! $COMPOSE exec -T db pg_dump -U baby babyrecipes > "$SAFETY" || [ ! -s "$SAFETY" ]; then
  rm -f "$SAFETY"
  echo "Could not save a safety copy of the current data. Nothing was changed." >&2
  exit 1
fi
echo "Saved the current data to $SAFETY"

# One transaction: if the backup is broken, the drop is rolled back and nothing is lost.
{ echo 'drop schema public cascade; create schema public;'; cat "$FILE"; } \
  | $COMPOSE exec -T db psql -1 -v ON_ERROR_STOP=1 -U baby babyrecipes
echo "Restored $FILE"
