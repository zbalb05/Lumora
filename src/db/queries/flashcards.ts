import { randomUUID } from 'expo-crypto';
import { count, eq, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { flashcards } from '@/db/schema';
import { enqueueSync } from '@/db/sync/enqueue';

export async function createFlashcards(
  studySetId: string,
  documentId: string,
  cards: { front: string; back: string }[]
) {
  if (cards.length === 0) return [];
  const rows = await db
    .insert(flashcards)
    .values(cards.map((c) => ({ id: randomUUID(), studySetId, documentId, ...c })))
    .returning();
  await Promise.all(rows.map((row) => enqueueSync('flashcards', row.id, 'insert', row)));
  return rows;
}

export async function listFlashcardsByDocument(documentId: string) {
  return db.select().from(flashcards).where(eq(flashcards.documentId, documentId));
}

export async function countDueFlashcards() {
  const [row] = await db
    .select({ value: count() })
    .from(flashcards)
    .where(lte(flashcards.dueAt, sql`(datetime('now'))`));
  return row?.value ?? 0;
}

/** SM-2-lite: on a hit, grow the interval by the ease factor; on a miss, reset to 1 day and soften ease. */
export async function reviewFlashcard(id: string, remembered: boolean) {
  const [card] = await db.select().from(flashcards).where(eq(flashcards.id, id));
  if (!card) return;

  const intervalDays = remembered ? Math.max(1, Math.round(card.intervalDays * (card.easeFactor / 100))) : 1;
  const easeFactor = remembered ? Math.min(300, card.easeFactor + 15) : Math.max(130, card.easeFactor - 20);

  const [row] = await db
    .update(flashcards)
    .set({
      intervalDays,
      easeFactor,
      lastReviewedAt: sql`(datetime('now'))`,
      dueAt: sql`(datetime('now', '+' || ${intervalDays} || ' days'))`,
    })
    .where(eq(flashcards.id, id))
    .returning();
  if (row) await enqueueSync('flashcards', id, 'update', row);
}
