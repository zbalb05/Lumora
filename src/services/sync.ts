import { asc, eq, inArray } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

import { db } from '@/db/client';
import {
  activityLog,
  chatMessages,
  chunks,
  documents,
  flashcards,
  goals,
  notes,
  quizQuestions,
  quizzes,
  reminders,
  studySets,
  syncQueue,
  syncState,
} from '@/db/schema';
import { supabase } from '@/services/supabase';

type QueueRow = typeof syncQueue.$inferSelect;

const TABLE_MAP: Record<(typeof TABLE_ORDER)[number], SQLiteTable> = {
  study_sets: studySets,
  documents,
  chunks,
  notes,
  flashcards,
  quizzes,
  quiz_questions: quizQuestions,
  chat_messages: chatMessages,
  goals,
  reminders,
  activity_log: activityLog,
};

// Parent-before-child order, matching the FK dependency graph in the Postgres schema (Phase 2) —
// insert/update batches are pushed in this order so a child row's foreign key never references a
// parent that hasn't landed yet. Deletes don't need this: we only ever enqueue deletes at a
// cascade root (see each query file's comments), so Postgres's own ON DELETE CASCADE does the rest.
const TABLE_ORDER = [
  'study_sets',
  'documents',
  'chunks',
  'notes',
  'flashcards',
  'quizzes',
  'quiz_questions',
  'chat_messages',
  'goals',
  'reminders',
  'activity_log',
] as const;

function toSnakeCase(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    result[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
  }
  return result;
}

async function markFailed(rows: QueueRow[], message: string) {
  await Promise.all(
    rows.map((row) =>
      db
        .update(syncQueue)
        .set({ attempts: row.attempts + 1, lastError: message })
        .where(eq(syncQueue.id, row.id))
    )
  );
}

let pushInFlight: Promise<void> | null = null;

/** Drains the local sync_queue to Supabase, one batched upsert/delete per table, in FK order.
 * Silently best-effort: failed batches stay queued (with attempts/lastError recorded) for the
 * next trigger to retry, rather than surfacing an error to the UI. */
export function pushPendingChanges(): Promise<void> {
  // Coalesce concurrent callers (e.g. a debounced post-write push overlapping a pull-to-refresh
  // push) into a single in-flight run instead of racing two drains of the same queue.
  if (pushInFlight) return pushInFlight;
  pushInFlight = runPush().finally(() => {
    pushInFlight = null;
  });
  return pushInFlight;
}

async function runPush(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return;

  const pending = await db.select().from(syncQueue).orderBy(asc(syncQueue.createdAt));
  if (pending.length === 0) return;

  const processedIds: string[] = [];

  for (const table of TABLE_ORDER) {
    const upserts = pending.filter(
      (row) => row.tableName === table && (row.operation === 'insert' || row.operation === 'update')
    );
    const deletes = pending.filter((row) => row.tableName === table && row.operation === 'delete');

    if (upserts.length > 0) {
      const rows = upserts
        .filter((row) => row.payload)
        .map((row) => ({ ...toSnakeCase(row.payload as Record<string, unknown>), user_id: userId }));
      if (rows.length > 0) {
        const { error } = await supabase.from(table).upsert(rows);
        if (error) {
          await markFailed(upserts, error.message);
        } else {
          processedIds.push(...upserts.map((row) => row.id));
        }
      } else {
        processedIds.push(...upserts.map((row) => row.id));
      }
    }

    if (deletes.length > 0) {
      const ids = deletes.map((row) => row.rowId);
      const { error } = await supabase.from(table).delete().in('id', ids);
      if (error) {
        await markFailed(deletes, error.message);
      } else {
        processedIds.push(...deletes.map((row) => row.id));
      }
    }
  }

  if (processedIds.length > 0) {
    await db.delete(syncQueue).where(inArray(syncQueue.id, processedIds));
  }
}

function toCamelCase(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    // user_id/updated_at/deleted_at are Postgres-only bookkeeping columns — the local schema
    // doesn't have them, so a remote row is trimmed down to just its domain fields before
    // reaching the local upsert.
    if (key === 'user_id' || key === 'updated_at' || key === 'deleted_at') continue;
    result[key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())] = value;
  }
  return result;
}

async function getWatermark(table: string): Promise<string | null> {
  const [row] = await db.select().from(syncState).where(eq(syncState.tableName, table));
  return row?.lastPulledAt ?? null;
}

async function setWatermark(table: string, value: string) {
  await db
    .insert(syncState)
    .values({ tableName: table, lastPulledAt: value })
    .onConflictDoUpdate({ target: syncState.tableName, set: { lastPulledAt: value } });
}

let pullInFlight: Promise<void> | null = null;

/** Pulls rows changed since each table's last-pulled watermark into the local cache. Applies a
 * non-null `deleted_at` as a local hard delete; everything else is an upsert by id. */
export function pullRemoteChanges(): Promise<void> {
  if (pullInFlight) return pullInFlight;
  pullInFlight = runPull().finally(() => {
    pullInFlight = null;
  });
  return pullInFlight;
}

async function runPull(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return;

  for (const table of TABLE_ORDER) {
    const localTable = TABLE_MAP[table];
    const watermark = await getWatermark(table);

    let query = supabase.from(table).select('*').eq('user_id', userId).order('updated_at', { ascending: true });
    if (watermark) query = query.gt('updated_at', watermark);

    const { data, error } = await query;
    if (error || !data || data.length === 0) continue;

    for (const remoteRow of data as Record<string, unknown>[]) {
      const id = remoteRow.id as string;
      const idColumn = (localTable as unknown as { id: SQLiteTable }).id;
      if (remoteRow.deleted_at) {
        await db.delete(localTable).where(eq(idColumn as never, id));
        continue;
      }
      const localRow = { ...toCamelCase(remoteRow), id };
      await db
        .insert(localTable)
        .values(localRow as never)
        .onConflictDoUpdate({ target: idColumn as never, set: localRow as never });
    }

    const latest = (data[data.length - 1] as Record<string, unknown>).updated_at as string;
    await setWatermark(table, latest);
  }
}
