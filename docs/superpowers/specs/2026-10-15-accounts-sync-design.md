# Accounts and synced data: design

Extends `2026-10-14-baby-recipes-design.md`. Where this document disagrees with that one (single user, localhost only, browser storage only, no login), this one wins.

## Intent

The author wants to open the site from other devices (for example a phone in the kitchen) and find the baby's birthday, liked recipes, "not liked" list and shown recipes already there. A handful of other people she invites should be able to use it too, each with their own private data. Today everything lives in one browser's `localStorage`, so it is lost when the browser data is cleared and is invisible from other devices.

## Users

The author plus people she personally invites (partner, family, friends: single digits). Not a public product.

## Behaviour

1. **Invite-only.** There is no public sign-up. The author creates an invite on the admin page (see Admin page below) by entering an email; the page shows a one-time sign-up link once. She sends it herself. The link expires after 7 days (my call) and works once.
2. **Sign-up.** Opening the link asks for a password (minimum 10 characters, my call) and creates the account for that email.
3. **Log in / log out.** Email and password. A session lasts 30 days (my call) and survives closing the browser. Logging out ends it on that device only.
4. **Forgotten password.** The author clicks Reset password for that person on the admin page, which shows a one-time reset link once, valid 24 hours (my call), and she sends it manually. Using the link sets a new password; the old one stops working and the person's existing sessions end (my call). There is no email sending in this version.
5. **Synced data.** Per account, stored on the server: baby birthday, liked recipes, disliked recipes, shown titles. Same shapes and rules as in the first design (restore, no duplicates, shown list). Every screen reads and writes through the server so every device sees the same data after logging in.
6. **Fresh start (decided by the author).** Existing data in the laptop browser is not migrated. The hosted site starts empty. After the move, the browser no longer stores birthday or recipes at all; the server is the only store.
7. **Daily limit.** 10 recipes per account per calendar day (author's local day is unknown; use UTC, my call). A request counts once, when it ends in a recipe being shown (my call). Failed requests (generation failed, OpenAI error, too young, invalid input) do not count. To stop failures burning paid calls, each account is also capped at 30 OpenAI calls per day, retries included (my call). Both checks reserve their slot atomically before calling OpenAI so two devices cannot overshoot, and a reserved slot is released if the request fails (my call). The admin account is exempt from the limits (my call). Portion changes, liked-recipe views and restores never count. Over the limit, the app shows a clear message with when it resets.
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
- **The first admin** is created by one command run on the host (`create-admin <email>`, which prints a one-time sign-up link; my call). There is no other way to become admin, and exactly one admin exists (my call). If the admin forgets her password, she runs the same command with her own email on the host, which prints a one-time reset link instead of creating anything new (my call). A different email is refused once an admin exists.
- The admin's People row shows no daily-limit figure, since the admin is exempt (my call).
- Every admin request is checked on the server; a non-admin account calling an admin endpoint gets a refusal and learns nothing.

## Constraints

- English UI, same safety rules and gram/kg-only quantities as the first design.
- Passwords are stored only as salted hashes (Node built-in `crypto.scrypt`, no extra dependency; my call). Never logged, never returned.
- Sessions are random tokens in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie; the server stores only a hash of the token (my call).
- The OpenAI key stays on the server. All recipe requests require a valid session.
- HTTPS is provided by Heroku, which also puts a proxy in front of the app. The server no longer binds to `127.0.0.1` only or rejects non-local `Host` headers; it listens on the port Heroku provides (`PORT`) and accepts the configured public host name (setting `APP_HOST`).
- Login and sign-up attempts are rate limited per IP and per email (my call: 10 failures per 15 minutes).
- Hosting (decided by the author): Heroku, one web dyno. Heroku's file system is temporary and wiped on every restart and deploy, so nothing may be stored in local files.
- Storage (changed because of Heroku): the Heroku Postgres add-on. All accounts, sessions, invites, resets, per-account recipe data and daily-use counts live there. Backups use Heroku Postgres's built-in backup feature (builder confirms what the chosen plan includes). Config values (OpenAI key, `APP_HOST`, database address) are Heroku config vars, never committed.
- Both Heroku Postgres and the dyno are paid; the author pays. The builder states the plan names and what they include, not prices.
- Deployment scope (my call): the build ends with a deploy-ready project (`Procfile`, Node version in `package.json`, build step, database setup/migration on release, environment variable list) and a short runbook covering how to create the app, add the database, set the config vars, deploy, run `create-admin` with `heroku run`, and restore a backup. The author runs the actual deploy with her own Heroku account; the builder does not hold her credentials.
- Local development and tests must run without a hosted database and still pass on Node 19.2.0 unless the author upgrades (the builder chooses how, for example a local Postgres or an in-process stand-in).

## Goals

- Data is never lost when a browser is cleared; it is available on every device after login.
- Only invited people can use the site or spend the OpenAI credits.
- One person's data is never visible to another.
- Everything in the first design keeps working.

## Non-goals

- Public sign-up, social login, email sending, email verification, two-factor authentication.
- Several babies per account, shared accounts, sharing recipes between people.
- Offline use, mobile app.
- Importing data from the old browser-only version (the author chose a fresh start).
- Disabling an account without deleting it, editing a person's email, several admins, an audit log.

## Anti-goals

- Anyone without an invite creating an account.
- A non-admin account using any admin function, or the admin page being reachable without an admin session.
- A removed person's data surviving anywhere (including sessions that keep working).
- One account reading, changing or deleting another account's data, including by guessing ids.
- A password, reset link, invite link, session token or API key written to logs or sent to another user.
- Losing a user's data on deploy or restart.
- The first design's safety rules being skipped for any request.

## Left to the builder

- Database library and schema, migration approach, session store details, how the browser app talks to the server (endpoints), Heroku configuration details, rate limiter implementation, UI styling of the login, account and admin screens.

## Open points

- Where the invited people live (affects privacy-law wording for a child's birthday). Default: show a short privacy note and keep only the listed data.
