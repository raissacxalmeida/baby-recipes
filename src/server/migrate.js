import { MIGRATIONS } from './migrations.js';

export async function migrate(db) {
  await db.query('create table if not exists schema_migrations (version int primary key)');
  const { rows } = await db.query('select version from schema_migrations');
  const done = new Set(rows.map((r) => r.version));
  for (let i = 0; i < MIGRATIONS.length; i++) {
    if (done.has(i + 1)) continue;
    await db.transaction(async (tx) => {
      for (const statement of MIGRATIONS[i]) await tx.query(statement);
      await tx.query('insert into schema_migrations (version) values ($1)', [i + 1]);
    });
  }
}
