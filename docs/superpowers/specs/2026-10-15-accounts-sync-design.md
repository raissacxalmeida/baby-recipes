# Accounts and synced data: design

Extends `2026-10-14-baby-recipes-design.md`. Where this document disagrees with that one (single user, localhost only, browser storage only, no login), this one wins.

## Intent

The author wants to open the site from other devices (for example a phone in the kitchen) and find the baby's birthday, liked recipes, "not liked" list and shown recipes already there. A handful of other people she invites should be able to use it too, each with their own private data. Today everything lives in one browser's `localStorage`, so it is lost when the browser data is cleared and is invisible from other devices.

## Users

The author plus people she personally invites (partner, family, friends: single digits). Not a public product.

## Behaviour

1. **Invite-only.** There is no public sign-up. The author creates an invite on the server with a command (for example `npm run invite -- name@example.com`), which prints a one-time sign-up link. She sends it herself. The link expires after 7 days (my call) and works once.
2. **Sign-up.** Opening the link asks for a password (minimum 10 characters, my call) and creates the account for that email.
3. **Log in / log out.** Email and password. A session lasts 30 days (my call) and survives closing the browser. Logging out ends it on that device only.
4. **Forgotten password.** Another command (`npm run reset -- name@example.com`) prints a one-time reset link, valid 24 hours (my call), which the author sends manually. There is no email sending in this version.
5. **Synced data.** Per account, stored on the server: baby birthday, liked recipes, disliked recipes, shown titles. Same shapes and rules as in the first design (restore, no duplicates, shown list). Every screen reads and writes through the server so every device sees the same data after logging in.
6. **Fresh start (decided by the author).** Existing data in the laptop browser is not migrated. The hosted site starts empty. After the move, the browser no longer stores birthday or recipes at all; the server is the only store.
7. **Daily limit.** 10 new recipe requests per account per calendar day (author's local day is unknown; use UTC, my call). Portion changes, liked-recipe views and restores do not count. Over the limit, the app shows a clear message with when it resets.
8. **Delete account.** A button that deletes the account and all its data after confirmation.
9. **One baby per account.** Unchanged from the first design.

## Constraints

- English UI, same safety rules and gram/kg-only quantities as the first design.
- Passwords are stored only as salted hashes (Node built-in `crypto.scrypt`, no extra dependency; my call). Never logged, never returned.
- Sessions are random tokens in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie; the server stores only a hash of the token (my call).
- The OpenAI key stays on the server. All recipe requests require a valid session.
- HTTPS is provided by the host. The server no longer binds to `127.0.0.1` only or rejects non-local `Host` headers; it accepts the configured public host name instead (setting `APP_HOST`).
- Login and sign-up attempts are rate limited per IP and per email (my call: 10 failures per 15 minutes).
- Storage: SQLite file on a persistent disk. Daily automatic backup of the file, keeping the last 7 (my call).
- Hosting: one small host with a persistent disk (my pick: Fly.io; the builder confirms or proposes an equivalent). The author provides the account and pays.
- Deployment scope (my call): the build ends with a deploy-ready project (host config, environment and secret setup, backup job) and a short runbook covering how to deploy, how to run `invite` and `reset` on the host (shell access to the host), and how to restore a backup. The author runs the actual deploy with her own account; the builder does not hold her host credentials.
- Node version on the host is chosen by the builder; local development is on Node 19.2.0 and tests must keep passing there unless the author upgrades.

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
- An admin web page: invites and resets are commands run by the author.

## Anti-goals

- Anyone without an invite creating an account.
- One account reading, changing or deleting another account's data, including by guessing ids.
- A password, reset link, invite link, session token or API key written to logs or sent to another user.
- Losing a user's data on deploy or restart.
- The first design's safety rules being skipped for any request.

## Left to the builder

- Database library and schema, migration approach, session store details, how the browser app talks to the server (endpoints), host configuration, backup mechanism, rate limiter implementation, UI styling of the login and account screens.

## Open points

- Where the invited people live (affects privacy-law wording for a child's birthday). Default: show a short privacy note and keep only the listed data.
