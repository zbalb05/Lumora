import { randomUUID } from 'expo-crypto';
import { desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { documents, studySets } from '@/db/schema';
import { enqueueSync } from '@/db/sync/enqueue';

export type DocumentStatus = (typeof documents.$inferSelect)['status'];
export type DocumentSourceType = (typeof documents.$inferSelect)['sourceType'];
export type DocumentSlidesSourceType = NonNullable<(typeof documents.$inferSelect)['slidesSourceType']>;

export async function listAllDocuments() {
  return db.select().from(documents).orderBy(desc(documents.createdAt));
}

export async function listDocumentsByStudySet(studySetId: string) {
  return db
    .select()
    .from(documents)
    .where(eq(documents.studySetId, studySetId))
    .orderBy(desc(documents.createdAt));
}

export async function getDocument(id: string) {
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  return row;
}

export async function createDocument(input: {
  studySetId: string;
  title: string;
  sourceType: DocumentSourceType;
  uri: string;
  slidesUri?: string | null;
  slidesSourceType?: DocumentSlidesSourceType | null;
}) {
  const [row] = await db
    .insert(documents)
    .values({ id: randomUUID(), status: 'pending', ...input })
    .returning();
  await enqueueSync('documents', row.id, 'insert', row);
  return row;
}

export async function updateDocumentStatus(
  id: string,
  status: DocumentStatus,
  errorMessage?: string
) {
  const [row] = await db
    .update(documents)
    .set({ status, errorMessage })
    .where(eq(documents.id, id))
    .returning();
  if (row) await enqueueSync('documents', id, 'update', row);
}

export async function updateDocumentTitle(id: string, title: string) {
  const [row] = await db.update(documents).set({ title }).where(eq(documents.id, id)).returning();
  if (row) await enqueueSync('documents', id, 'update', row);
}

export async function markFlashcardsCompleted(id: string) {
  const [row] = await db
    .update(documents)
    .set({ flashcardsCompletedAt: sql`(datetime('now'))` })
    .where(eq(documents.id, id))
    .returning();
  if (row) await enqueueSync('documents', id, 'update', row);
}

/**
 * Deletes a document by deleting its owning study set — each document has its own dedicated
 * study set (created 1:1 at ingestion time), so this also cascades away its notes, flashcards,
 * quiz, and chat history, and removes it from the Chat tab's study set chips. Postgres's own
 * cascade (Phase 2's schema) mirrors this, so only the study_sets root needs to be enqueued.
 */
export async function deleteDocument(id: string) {
  const document = await getDocument(id);
  if (!document) return;
  await db.delete(studySets).where(eq(studySets.id, document.studySetId));
  await enqueueSync('study_sets', document.studySetId, 'delete');
}
