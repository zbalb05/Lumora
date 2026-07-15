import { randomUUID } from 'expo-crypto';
import { gte } from 'drizzle-orm';

import { db } from '@/db/client';
import { activityLog } from '@/db/schema';
import { enqueueSync } from '@/db/sync/enqueue';
import { toDateKey } from '@/utils/calendar';

export async function logActivity(
  type: (typeof activityLog.$inferSelect)['type'],
  metadata?: Record<string, unknown>
) {
  const [row] = await db
    .insert(activityLog)
    .values({ id: randomUUID(), date: toDateKey(new Date()), type, metadata })
    .returning();
  await enqueueSync('activity_log', row.id, 'insert', row);
}

/** Activity rows from the last `days` days, most recent first — powers the calendar + chart. */
export async function listRecentActivity(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return db.select().from(activityLog).where(gte(activityLog.date, toDateKey(since)));
}
