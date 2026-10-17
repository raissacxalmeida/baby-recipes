// Each migration is a list of single SQL statements (PGlite and pg both accept one statement per query).
export const MIGRATIONS = [
  [
    `create table users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      password_hash text not null,
      is_admin boolean not null default false,
      birthdate date,
      created_at timestamptz not null default now(),
      last_login_at timestamptz
    )`,
    `create table invites (
      id uuid primary key default gen_random_uuid(),
      email text not null,
      token_hash text not null unique,
      is_admin boolean not null default false,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    )`,
    `create table resets (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null,
      used_at timestamptz
    )`,
    `create table sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )`,
    `create table recipes (
      user_id uuid not null references users(id) on delete cascade,
      id text not null,
      data jsonb not null,
      status text not null check (status in ('liked', 'disliked')),
      updated_at timestamptz not null default now(),
      primary key (user_id, id)
    )`,
    `create table shown (
      user_id uuid not null references users(id) on delete cascade,
      title text not null,
      shown_at timestamptz not null default now(),
      primary key (user_id, title)
    )`,
    `create table usage (
      user_id uuid not null references users(id) on delete cascade,
      day date not null,
      recipes int not null default 0,
      calls int not null default 0,
      primary key (user_id, day)
    )`,
    `create table login_attempts (
      email text primary key,
      failures int not null,
      first_failure_at timestamptz not null,
      locked_until timestamptz
    )`,
  ],
  // Exactly one admin, enforced by the database itself.
  ['create unique index one_admin on users (is_admin) where is_admin'],
  // Community recipes. A shared recipe is a snapshot owned by its sharer; likes copy it into the liker's own list.
  [
    // Which shared recipe a saved copy came from (no foreign key: the copy outlives an unshare).
    'alter table recipes add column copied_from uuid',
    `create table shared_recipes (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      recipe_id text not null,
      data jsonb not null,
      grp text not null,
      baby_months int not null,
      created_at timestamptz not null default now(),
      unique (user_id, recipe_id)
    )`,
    `create table shared_likes (
      shared_id uuid not null references shared_recipes(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      primary key (shared_id, user_id)
    )`,
  ],
];

export const APP_TABLES = ['users', 'invites', 'resets', 'sessions', 'recipes', 'shown', 'usage', 'login_attempts', 'shared_recipes', 'shared_likes'];
