import { randomUUID } from 'expo-crypto';

import { db } from '@/db/client';
import { syncQueue } from '@/db/schema';
import { pushPendingChanges } from '@/services/sync';

export type SyncOperation = 'insert' | 'update' | 'delete';

const PUSH_DEBOUNCE_MS = 2500;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Records a pending change for Phase 3's background push to Supabase. `payload` should be the
 * row's local (camelCase) fields for insert/update; omit it for delete (only `rowId` matters).
 * Call this right after the local write succeeds, inside the same query-file function that made it.
 *
 * Schedules a debounced push after the write settles, rather than pushing synchronously on every
 * call — a multi-step write burst (e.g. ingesting a document: study set, document, chunks, note,
 * flashcards, quiz all in one go) would otherwise fire a network call per row.
 */
export async function enqueueSync(
  tableName: string,
  rowId: string,
  operation: SyncOperation,
  payload?: Record<string, unknown>
) {
  await db.insert(syncQueue).values({
    id: randomUUID(),
    tableName,
    rowId,
    operation,
    payload: operation === 'delete' ? null : (payload ?? null),
  });

  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushPendingChanges();
  }, PUSH_DEBOUNCE_MS);
}
