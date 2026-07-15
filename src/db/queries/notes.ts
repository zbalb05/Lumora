import { randomUUID } from 'expo-crypto';
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { notes } from '@/db/schema';
import { enqueueSync } from '@/db/sync/enqueue';

export async function createNote(studySetId: string, documentId: string, markdown: string) {
  const [row] = await db.insert(notes).values({ id: randomUUID(), studySetId, documentId, markdown }).returning();
  await enqueueSync('notes', row.id, 'insert', row);
  return row;
}

export async function getNoteByDocument(documentId: string) {
  const [row] = await db.select().from(notes).where(eq(notes.documentId, documentId));
  return row;
}

export async function getNoteByStudySet(studySetId: string) {
  const [row] = await db.select().from(notes).where(eq(notes.studySetId, studySetId));
  return row;
}
