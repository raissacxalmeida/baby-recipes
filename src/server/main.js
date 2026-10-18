import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { createPgDb } from './db.js';
import { migrate } from './migrate.js';
import { callModel } from './openai.js';
import { seedCatalogue } from './seedCatalogue.js';
import { createServer, loadEnv } from './server.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDb(db, retries, delayMs) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await db.query('select 1');
      return;
    } catch {
      if (attempt === retries) throw new Error('Could not reach the database. Is the db service running?');
      await sleep(delayMs);
    }
  }
}

export async function startMain(env, { createDb = createPgDb, now = () => new Date(), retries = 30, retryDelayMs = 1000 } = {}) {
  const config = loadConfig(env);
  const db = await createDb(config.databaseUrl);
  try {
    await waitForDb(db, retries, retryDelayMs);
    await migrate(db);
  } catch (err) {
    await db.close?.();
    throw err;
  }
  try {
    await seedCatalogue(db);
  } catch (err) {
    console.error(`Could not seed the recipe catalogue: ${err.message}`);
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const server = createServer({
    db,
    config,
    now,
    staticDir: path.join(repoRoot, 'dist'),
    callModel: (input) => callModel(input, { apiKey: config.openaiKey }),
  });
  await new Promise((resolve) => server.listen(config.port, '0.0.0.0', resolve));
  return { server, db, config };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  loadEnv('.env');
  try {
    const { config } = await startMain(process.env);
    console.log(`Listening on ${config.publicUrl}`);
  } catch (err) {
    console.error(`Could not start: ${err.message}`);
    process.exit(1);
  }
}
