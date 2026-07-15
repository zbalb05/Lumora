import { randomUUID } from 'expo-crypto';
import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { reminders } from '@/db/schema';
import { enqueueSync } from '@/db/sync/enqueue';

export async function listReminders() {
  return db.select().from(reminders).orderBy(asc(reminders.hour), asc(reminders.minute));
}

export async function createReminder(title: string, hour: number, minute: number) {
  const [row] = await db
    .insert(reminders)
    .values({ id: randomUUID(), title, hour, minute, enabled: true })
    .returning();
  await enqueueSync('reminders', row.id, 'insert', row);
  return row;
}

export async function updateReminder(
  id: string,
  input: Partial<{ title: string; hour: number; minute: number; enabled: boolean }>
) {
  const [row] = await db.update(reminders).set(input).where(eq(reminders.id, id)).returning();
  if (row) await enqueueSync('reminders', id, 'update', row);
}

export async function deleteReminder(id: string) {
  await db.delete(reminders).where(eq(reminders.id, id));
  await enqueueSync('reminders', id, 'delete');
}
