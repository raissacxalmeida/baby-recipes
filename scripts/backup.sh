#!/usr/bin/env bash
# Writes a Postgres dump to backups/ and keeps the 7 newest. Run from anywhere.
set -euo pipefail
# Dumps hold password hashes and birthdates: readable by the owner only.
umask 077
cd "$(dirname "$0")/.."

COMPOSE=${COMPOSE:-docker compose}
DIR=${BACKUP_DIR:-backups}
STAMP=${BACKUP_TIMESTAMP:-$(date +%Y%m%d-%H%M%S)}
FILE="$DIR/babyrecipes-$STAMP.sql"

mkdir -p "$DIR"
if ! $COMPOSE exec -T db pg_dump -U baby babyrecipes > "$FILE" || [ ! -s "$FILE" ]; then
  rm -f "$FILE"
  echo "Backup failed. No old backups were deleted." >&2
  exit 1
fi

ls -1 "$DIR"/babyrecipes-*.sql | sort -r | tail -n +8 | while read -r old; do rm -f "$old"; done
echo "Saved $FILE"
