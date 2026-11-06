import { addBaby } from '../../src/server/babies.js';
import type { Db } from '../../src/server/types.js';

// A baby for a user, added the way the app adds one; returns its id.
export async function addTestBaby(db: Db, userId: string, birthdate = '2026-02-14', name = 'Mia'): Promise<string> {
  const baby = await addBaby(db, userId, { name, birthdate }, new Date('2026-10-15T12:00:00Z'));
  return baby.id;
}
