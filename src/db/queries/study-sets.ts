import { randomUUID } from 'expo-crypto';
import { desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db/client';
import { documents, studySets } from '@/db/schema';
import { enqueueSync } from '@/db/sync/enqueue';

export async function listStudySets() {
  return db.select().from(studySets).orderBy(desc(studySets.createdAt));
}

export async function getStudySet(id: string) {
  const [row] = await db.select().from(studySets).where(eq(studySets.id, id));
  return row;
}

export async function createStudySet(title: string) {
  const [row] = await db.insert(studySets).values({ id: randomUUID(), title }).returning();
  await enqueueSync('study_sets', row.id, 'insert', row);
  return row;
}

export async function updateStudySetTitle(id: string, title: string) {
  const [row] = await db.update(studySets).set({ title }).where(eq(studySets.id, id)).returning();
  if (row) await enqueueSync('study_sets', id, 'update', row);
}

/**
 * Removes study sets with no documents. An older version of the delete flow only removed the
 * `documents` row and left its owning study set (and chat history) behind — this is a one-time
 * sweep to clean up any of those already sitting in the database.
 */
export async function deleteOrphanedStudySets() {
  const allSets = await db.select({ id: studySets.id }).from(studySets);
  const allDocs = await db.select({ studySetId: documents.studySetId }).from(documents);
  const usedIds = new Set(allDocs.map((d) => d.studySetId));
  const orphanIds = allSets.map((s) => s.id).filter((id) => !usedIds.has(id));
  if (orphanIds.length === 0) return;
  await db.delete(studySets).where(inArray(studySets.id, orphanIds));
  await Promise.all(orphanIds.map((id) => enqueueSync('study_sets', id, 'delete')));
}
