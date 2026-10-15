# Accounts and synced data: design

Extends `2026-10-14-baby-recipes-design.md`. Where this document disagrees with that one (single user, localhost only, browser storage only, no login), this one wins.

## Intent

The author wants to open the site from other devices (for example a phone in the kitchen) and find the baby's birthday, liked recipes, "not liked" list and shown recipes already there. A handful of other people she invites should be able to use it too, each with their own private data. Today everything lives in one browser's `localStorage`, so it is lost when the browser data is cleared and is invisible from other devices.

## Users

The author plus people she personally invites (partner, family, friends: single digits), all on the author's home Wi-Fi. Not a public product.

## Behaviour

1. **Invite-only.** There is no public sign-up. The author creates an invite on the admin page (see Admin page below) by entering an email; the page shows a one-time sign-up link once. She sends it herself. The link expires after 7 days (my call) and works once.
2. **Sign-up.** Opening the link asks for a password (minimum 10 characters, my call) and creates the account for that email.
3. **Log in / log out.** Email and password. A session lasts 30 days (my call) and survives closing the browser. Logging out ends it on that device only.
4. **Forgotten password.** The author clicks Reset password for that person on the admin page, which shows a one-time reset link once, valid 24 hours (my call), and she sends it manually. Using the link sets a new password; the old one stops working and the person's existing sessions end (my call). There is no email sending in this version.
5. **Synced data.** Per account, stored on the server: baby birthday, liked recipes, disliked recipes, shown titles. Same shapes and rules as in the first design (restore, no duplicates, shown list). Every screen reads and writes through the server so every device sees the same data after logging in.
6. **Fresh start (decided by the author).** Existing data in the laptop browser is not migrated. The new site starts empty. After the move, the browser no longer stores birthday or recipes at all; the server is the only store.
7. **Daily limit.** 10 recipes per account per calendar day (author's local day is unknown; use UTC, my call). A request counts once, when it ends in a recipe being shown (my call). Failed requests (generation failed, OpenAI error, too young, invalid input) do not count. To stop failures burning paid calls, each account is also capped at 30 OpenAI calls per day, retries included (my call). Both checks reserve their slot atomically before calling OpenAI so two devices cannot overshoot. The recipe slot is released if the request ends without a recipe; OpenAI-call slots are used up by every attempt and never released, which is what makes the 30-call cap stop failures from burning paid calls (my call). The admin account is exempt from the limits (my call). Portion changes, liked-recipe views and restores never count. Over the limit, the app shows a clear message with when it resets.
8. **Delete account.** A button that deletes the account and all its data after confirmation. Not available to the admin account (my call, to avoid locking the author out).
9. **One baby per account.** Unchanged from the first design.

## Admin page

At `/admin`, visible and usable only by the admin account (decided by the author: she manages invites, resets and removals from the site).

- **Invite someone:** email field and Create invite. Shows the link once with a Copy button. An email that already has an account or a pending invite is refused with a message (my call).
- **Invites list:** email, status (pending with days left, used, expired), created date. Pending invites have Revoke; expired ones have Invite again.
- **People list:** email, joined date, last login, recipe requests today out of the daily limit (my call), with Reset password and Remove. The admin's own row has neither.
- **Reset password:** shows the reset link once with a Copy button.
- **Remove a person (decided by the author):** after a confirmation that names the email, the account is deleted immediately and permanently together with its data, sessions, and any pending invite or reset for that email. The email can be invited again later as a new account (my call).
- **Links are shown only once** (my call): the server stores only a hash of each invite and reset token, so a lost link means creating a new one.
- **The first admin** is created by one command run inside the app container (`create-admin <email>`, which prints a one-time sign-up link; my call). There is no other way to become admin, and exactly one admin exists (my call). If the admin forgets her password, she runs the same command with her own email, which prints a one-time reset link instead of creating anything new (my call). A different email is refused once an admin exists.
- The admin's People row shows no daily-limit figure, since the admin is exempt (my call).
- Every admin request is checked on the server; a non-admin account calling an admin endpoint gets a refusal and learns nothing.

## Hosting and storage

Decided by the author: the site runs on her own computer with Docker Compose, with a Postgres database as its own service in the same Compose project. It is used only on her home Wi-Fi (not from the internet).

- **Services:** one `app` service (the Node server and the built web app) and one `db` service (Postgres). `docker compose up` starts both; the app waits until the database is ready. Both restart automatically when Docker starts (my call).
- **Address:** the app is published on the computer at a fixed port (my call: 3000) and opened from other devices at the computer's address on the home network (for example `http://<computer-name>.local:3000` or its IP address). The server must work when opened by that address, not only `localhost`. Which host names it accepts is a setting (`ALLOWED_HOSTS`, my call).
- **Link addresses (my call):** invite and reset links are built from a required setting `PUBLIC_URL` (for example `http://my-mac.local:3000`), not from the request, because the admin may open the page at `localhost` while the link is for a phone and the `create-admin` command has no request at all. `.env.example` explains that it must be set to the computer's home-network address.
- **Plain HTTP:** there is no HTTPS on a home network, and browsers refuse to store a `Secure` cookie over plain HTTP. The session cookie is therefore `Secure` only when a setting says the site is served over HTTPS (`COOKIE_SECURE`, default off; my call). Passwords travel unencrypted on the home Wi-Fi, which the author has accepted for a trusted home network (decided by the author). The runbook states plainly that this suits only a network she trusts. Putting the site on the internet later would require HTTPS first and is out of scope.
- **Database:** Postgres runs only on the Compose network and is not published to the computer's network (my call). All accounts, sessions, invites, resets, per-account recipe data and daily-use counts live there, in a named Docker volume so data survives restarts, rebuilds and image updates.
- **Config:** the OpenAI key, the database password and the settings above come from a `.env` file read by Docker Compose; it is git-ignored and a `.env.example` listing every variable without values is committed (my call).
- **Backups:** one command writes a Postgres dump to a `backups/` folder next to the project and keeps the last 7 (my call). A matching command restores a chosen dump. Backups are manual or scheduled by the author; the runbook explains both (my call).
- **Availability:** the site is available only while the computer is on and Docker is running (accepted by the author).
- **Deliverables (my call):** `Dockerfile`, `compose.yaml`, `.env.example`, database setup that runs automatically on start, backup and restore commands, and a short runbook covering first start, creating the admin, backing up, restoring, updating, and the warning that `docker compose down -v` deletes the data volume. The builder does not need the author's OpenAI key; she supplies it in `.env`.
- **Development and tests:** they must not need the author's real database, and must pass on the machine's Node 19.2.0 unless the author upgrades. The container image's Node version is the builder's choice. The builder chooses how tests get a database (for example a throwaway Postgres container or an in-process stand-in).

## Constraints

- English UI, same safety rules and gram/kg-only quantities as the first design.
- Passwords are stored only as salted hashes (Node built-in `crypto.scrypt`, no extra dependency; my call). Never logged, never returned.
- Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` per the setting above); the server stores only a hash of the token (my call).
- The OpenAI key stays on the server. All recipe requests require a valid session.
- Login attempts are limited per email only: 10 failures in 15 minutes locks that email for 15 minutes, and a correct password is also refused during the lockout, with a message saying to wait (my call). Per-IP limiting is not used because Docker on a Mac or Windows usually hides the real device address, which would make one device lock everyone out. The cost is that someone on the home Wi-Fi could lock a person out by failing on purpose; the admin can always recover with the reset link and the container command.
- Nothing the app needs to keep may live only inside a container's own file system; everything persistent is in the database volume.

## Goals

- Data is never lost when a browser is cleared; it is available on every device on the home network after login.
- Only invited people can use the site or spend the OpenAI credits.
- One person's data is never visible to another.
- Everything in the first design keeps working.
- One command starts the whole thing on the author's computer.

## Non-goals

- Public sign-up, social login, email sending, email verification, two-factor authentication.
- Several babies per account, shared accounts, sharing recipes between people.
- Offline use, mobile app.
- Importing data from the old browser-only version (the author chose a fresh start).
- Disabling an account without deleting it, editing a person's email, several admins, an audit log.
- Access from outside the home network, HTTPS, a public domain name.

## Anti-goals

- Anyone without an invite creating an account.
- A non-admin account using any admin function, or the admin page being reachable without an admin session.
- A removed person's data surviving anywhere (including sessions that keep working).
- One account reading, changing or deleting another account's data, including by guessing ids.
- A password, reset link, invite link, session token or API key written to logs or sent to another user.
- Losing a user's data on restart, rebuild or update.
- The database being reachable from other devices on the network.
- The first design's safety rules being skipped for any request.

## Left to the builder

- Database library and schema, migration approach, session store details, how the browser app talks to the server (endpoints), the Dockerfile layout and base image, healthcheck details, rate limiter implementation, how backups are scheduled, UI styling of the login, account and admin screens.

## Open points

- Where the invited people live (affects privacy-law wording for a child's birthday). Default: show a short privacy note and keep only the listed data.
