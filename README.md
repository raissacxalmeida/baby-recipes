# Baby recipes

A small website that suggests baby-friendly recipes from the ingredients you have, for your baby's age. Invite-only accounts keep each person's data (birthday, liked recipes, not-liked recipes) on the server. It runs on your own computer with Docker Compose and is meant for your **home network**.

## What you need

- Docker Desktop (or Docker Engine with the Compose plugin) on the computer that will host the site.
- An OpenAI API key.

## First start

1. Copy the settings file and fill it in:
   ```bash
   cp .env.example .env
   ```
   Set `POSTGRES_PASSWORD` (letters and numbers only), `OPENAI_API_KEY`, and `PUBLIC_URL`.
2. `PUBLIC_URL` is the address other devices type to open the site, for example `http://my-mac.local:3000` or `http://192.168.1.20:3000`. Find your computer's name or address in the system network settings. Invite and reset links are built from it, so it must be reachable from your phone.
3. Start everything:
   ```bash
   docker compose up -d --build
   ```
4. Check that both services are healthy and open `PUBLIC_URL` in a browser:
   ```bash
   docker compose ps
   ```
5. Create your admin account (once). This prints a link; open it and choose a password:
   ```bash
   docker compose exec app node src/server/cli.js create-admin you@example.com
   ```
   If you ever forget the admin password, run the same command again with the same email. It prints a reset link instead.

## Inviting people

Log in, press **Admin**, type their email and press **Create invite**. Copy the link and send it to them yourself (for example in a chat message). The link works once and expires after 7 days. From the same page you can create a reset link for someone who forgot their password, revoke an invite, or remove a person. Links are shown only once: if you lose one, create a new one.

Limits: each person can get 10 recipes per day (UTC day) and the site makes at most 30 OpenAI calls per person per day. The admin has no limit.

## Backups and restoring

```bash
scripts/backup.sh
```

writes a dump to `backups/` and keeps the 7 newest. Run it by hand or schedule it, for example with `crontab -e`:

```
0 3 * * * cd /path/to/baby-recipes && scripts/backup.sh
```

To restore a backup (this **replaces all current data**):

```bash
docker compose stop app
scripts/restore.sh backups/babyrecipes-YYYYmmdd-HHMMSS.sql
docker compose start app
```

Copy the `backups/` folder somewhere else now and then; a backup on the same disk does not protect you if the disk fails.

## Updating

```bash
git pull
docker compose up -d --build
```

The database changes itself when the app starts. Your data stays in the Docker volume `pgdata`.

## Warnings

- `docker compose down -v` **deletes the database volume and all data**. Use `docker compose down` (without `-v`) to stop the site.
- The site uses plain HTTP, so passwords travel unencrypted over your Wi-Fi. Use it only on a network you trust, and do not expose it to the internet. Putting it online later would need HTTPS first.
- The site is available only while this computer is on and Docker is running.
- Your `.env` file holds the OpenAI key and database password. Do not commit or share it.

## Development

```bash
npm install
npm test          # runs against an in-process Postgres (PGlite); no Docker needed
npm run build
```
