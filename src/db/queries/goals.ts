import { randomUUID } from 'expo-crypto';
import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { goals } from '@/db/schema';
import { enqueueSync } from '@/db/sync/enqueue';
import { toDateKey } from '@/utils/calendar';

function todayDate() {
  return toDateKey(new Date());
}

export async function getGoalsForDate(date: string) {
  return db.select().from(goals).where(eq(goals.date, date)).orderBy(asc(goals.createdAt));
}

export async function getTodayGoals() {
  return getGoalsForDate(todayDate());
}

export async function addGoal(title: string) {
  const [row] = await db
    .insert(goals)
    .values({ id: randomUUID(), date: todayDate(), title, createdAt: new Date().toISOString() })
    .returning();
  await enqueueSync('goals', row.id, 'insert', row);
  return row;
}

export async function deleteGoal(id: string) {
  await db.delete(goals).where(eq(goals.id, id));
  await enqueueSync('goals', id, 'delete');
}

export async function completeGoal(id: string) {
  const [row] = await db
    .update(goals)
    .set({ completed: true, completedAt: new Date().toISOString() })
    .where(eq(goals.id, id))
    .returning();
  if (row) await enqueueSync('goals', id, 'update', row);
}
