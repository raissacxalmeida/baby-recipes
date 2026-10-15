import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { AppError } from './errors.js';
import { createAdmin } from './users.js';

const USAGE = 'Usage: node src/server/cli.js create-admin <email>';

export async function runCli(argv, { db, config, now, log }) {
  const [command, email] = argv;
  if (command !== 'create-admin') {
    log(USAGE);
    return 1;
  }
  if (!email) {
    log(USAGE);
    return 1;
  }
  try {
    const { kind, token } = await createAdmin(db, email, now());
    log(`${config.publicUrl}/${kind === 'invite' ? 'invite' : 'reset'}/${token}`);
    return 0;
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    log(`Error: ${err.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { loadEnv } = await import('./server.js');
  const { loadConfig } = await import('./config.js');
  const { createPgDb } = await import('./db.js');
  const { migrate } = await import('./migrate.js');
  loadEnv('.env');
  let code = 1;
  try {
    const config = loadConfig(process.env);
    const db = createPgDb(config.databaseUrl);
    try {
      await migrate(db);
      code = await runCli(process.argv.slice(2), { db, config, now: () => new Date(), log: console.log });
    } finally {
      await db.close();
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
  process.exit(code);
}
