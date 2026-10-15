import { test, expect, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (file) => readFileSync(join(root, file), 'utf8');
const compose = parse(read('compose.yaml'));

test('db: no published ports, a named volume, healthcheck and restart', () => {
  const { db } = compose.services;
  expect(db.ports).toBeUndefined();
  expect(db.image).toMatch(/^postgres:16/);
  expect(db.restart).toBe('unless-stopped');
  expect(db.healthcheck.test.join(' ')).toMatch(/pg_isready/);
  const mount = db.volumes.find((v) => v.endsWith(':/var/lib/postgresql/data'));
  expect(mount).toBeDefined();
  const name = mount.split(':')[0];
  expect(Object.keys(compose.volumes)).toContain(name);
  expect(name).not.toMatch(/^[./]/);
});

test('app: waits for a healthy db, publishes 3000 and restarts', () => {
  const { app } = compose.services;
  expect(app.depends_on.db.condition).toBe('service_healthy');
  expect(app.ports).toEqual(['3000:3000']);
  expect(app.restart).toBe('unless-stopped');
  expect(app.environment.DATABASE_URL).toBe('postgres://baby:${POSTGRES_PASSWORD}@db:5432/babyrecipes');
});

test('required settings fail loudly when missing', () => {
  const text = read('compose.yaml');
  for (const name of ['POSTGRES_PASSWORD', 'OPENAI_API_KEY', 'PUBLIC_URL']) {
    expect(text).toMatch(new RegExp(`\\$\\{${name}:\\?[^}]+\\}`));
  }
});

test('no secret value is written into the committed files', () => {
  for (const file of ['compose.yaml', 'Dockerfile', '.env.example']) {
    expect(read(file), file).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
  }
  const example = read('.env.example');
  for (const name of ['POSTGRES_PASSWORD', 'OPENAI_API_KEY']) {
    expect(example).toMatch(new RegExp(`^${name}=$`, 'm'));
  }
});

test('every setting the app reads is in .env.example or set by compose', () => {
  const example = read('.env.example');
  for (const name of ['POSTGRES_PASSWORD', 'OPENAI_API_KEY', 'PUBLIC_URL', 'ALLOWED_HOSTS', 'COOKIE_SECURE']) {
    expect(example, name).toMatch(new RegExp(`^${name}=`, 'm'));
  }
  expect(Object.keys(compose.services.app.environment)).toEqual(
    expect.arrayContaining(['DATABASE_URL', 'OPENAI_API_KEY', 'PUBLIC_URL', 'ALLOWED_HOSTS', 'COOKIE_SECURE', 'PORT']),
  );
});

test('.gitignore keeps .env and backups out of git', () => {
  const lines = read('.gitignore').split('\n').map((l) => l.trim());
  expect(lines).toContain('.env');
  expect(lines).toContain('backups/');
});

test('app: has a healthcheck and an init process so docker stop is quick', () => {
  const { app } = compose.services;
  expect(app.healthcheck.test.join(' ')).toMatch(/fetch/);
  expect(app.init).toBe(true);
});

test('Dockerfile runs the server as a non-root user from the built app', () => {
  const text = read('Dockerfile');
  expect(text).toMatch(/USER node/);
  expect(text).toMatch(/npm ci --omit=dev/);
  expect(text).toMatch(/CMD \["node", "src\/server\/main\.js"\]/);
});

// Scripts run against a stand-in for `docker compose` that records what it is given.
let dir;
let log;
let stdin;
let stub;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deploy-'));
  log = join(dir, 'calls.log');
  stdin = join(dir, 'stdin.txt');
  stub = join(dir, 'stub-compose');
  writeFileSync(stub, [
    '#!/usr/bin/env bash',
    'echo "$@" >> "$STUB_LOG"',
    'if [[ " $* " == *" pg_dump "* ]]; then',
    '  [ -n "${STUB_FAIL:-}" ] && exit 1',
    '  echo "-- fake dump"; echo "create table x();"; exit 0',
    'fi',
    'if [[ " $* " == *" psql "* ]]; then cat >> "$STUB_STDIN"; exit 0; fi',
    '',
  ].join('\n'));
  chmodSync(stub, 0o755);
});

const run = (script, args = [], extraEnv = {}) =>
  execFileSync('bash', [join(root, 'scripts', script), ...args], {
    env: { ...process.env, COMPOSE: stub, BACKUP_DIR: join(dir, 'backups'), STUB_LOG: log, STUB_STDIN: stdin, ...extraEnv },
    stdio: 'pipe',
  });
const backups = () => (existsSync(join(dir, 'backups')) ? readdirSync(join(dir, 'backups')).sort() : []);

test('backup writes the dump to a timestamped file', () => {
  run('backup.sh', [], { BACKUP_TIMESTAMP: '20261015-120000' });
  expect(backups()).toEqual(['babyrecipes-20261015-120000.sql']);
  expect(readFileSync(join(dir, 'backups', backups()[0]), 'utf8')).toContain('create table x();');
  expect(readFileSync(log, 'utf8')).toMatch(/exec -T db pg_dump -U baby babyrecipes/);
});

test('backup keeps only the 7 newest files', () => {
  for (let i = 1; i <= 9; i++) run('backup.sh', [], { BACKUP_TIMESTAMP: `20261015-12000${i}` });
  const files = backups();
  expect(files).toHaveLength(7);
  expect(files[0]).toBe('babyrecipes-20261015-120003.sql');
  expect(files[6]).toBe('babyrecipes-20261015-120009.sql');
});

test('a failed dump leaves no partial file, keeps old backups and exits non-zero', () => {
  run('backup.sh', [], { BACKUP_TIMESTAMP: '20261015-120000' });
  expect(() => run('backup.sh', [], { BACKUP_TIMESTAMP: '20261015-120001', STUB_FAIL: '1' })).toThrow();
  expect(backups()).toEqual(['babyrecipes-20261015-120000.sql']);
});

test('backup files are readable only by the owner', () => {
  run('backup.sh', [], { BACKUP_TIMESTAMP: '20261015-120000' });
  expect(statSync(join(dir, 'backups', backups()[0])).mode & 0o777).toBe(0o600);
});

test('restore refuses a missing file before touching the database', () => {
  expect(() => run('restore.sh', ['--yes', join(dir, 'nope.sql')])).toThrow();
  expect(existsSync(log)).toBe(false);
});

test('restore with --yes saves a safety copy first, then loads the dump in one transaction', () => {
  const dump = join(dir, 'x.sql');
  writeFileSync(dump, 'create table restored();\n');
  run('restore.sh', ['--yes', dump]);
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  expect(calls[0]).toMatch(/pg_dump/);
  expect(calls[1]).toMatch(/psql -1 -v ON_ERROR_STOP=1/);
  expect(backups().filter((f) => f.startsWith('pre-restore-'))).toHaveLength(1);
  const sent = readFileSync(stdin, 'utf8');
  expect(sent.indexOf('drop schema public cascade')).toBeLessThan(sent.indexOf('create table restored();'));
});

test('restore does not touch the database when the safety copy fails', () => {
  const dump = join(dir, 'x.sql');
  writeFileSync(dump, 'create table restored();\n');
  expect(() => run('restore.sh', ['--yes', dump], { STUB_FAIL: '1' })).toThrow();
  expect(existsSync(stdin)).toBe(false);
});

test('restore without --yes asks and cancels on anything but yes', () => {
  const dump = join(dir, 'x.sql');
  writeFileSync(dump, 'create table restored();\n');
  expect(() => execFileSync('bash', [join(root, 'scripts', 'restore.sh'), dump], {
    env: { ...process.env, COMPOSE: stub, BACKUP_DIR: join(dir, 'backups'), STUB_LOG: log, STUB_STDIN: stdin }, input: 'no\n', stdio: 'pipe',
  })).toThrow();
  expect(existsSync(stdin)).toBe(false);
  expect(existsSync(log)).toBe(false);
});

test('pre-restore copies are not counted in the 7-file backup rotation', () => {
  const dump = join(dir, 'x.sql');
  writeFileSync(dump, 'create table restored();\n');
  run('restore.sh', ['--yes', dump]);
  for (let i = 1; i <= 8; i++) run('backup.sh', [], { BACKUP_TIMESTAMP: `20261015-12000${i}` });
  expect(backups().filter((f) => f.startsWith('pre-restore-'))).toHaveLength(1);
  expect(backups().filter((f) => f.startsWith('babyrecipes-'))).toHaveLength(7);
});

test('the runbook covers the essentials', () => {
  const text = read('README.md');
  for (const phrase of [
    'docker compose up -d --build', 'create-admin', 'PUBLIC_URL', 'scripts/backup.sh', 'scripts/restore.sh',
    'docker compose down -v', 'home', 'HTTP',
  ]) {
    expect(text, phrase).toContain(phrase);
  }
});
