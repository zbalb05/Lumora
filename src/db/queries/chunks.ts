import { randomUUID } from 'expo-crypto';
import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { chunks } from '@/db/schema';

export async function insertChunks(
  documentId: string,
  values: { position: number; text: string; page?: number; timestampSec?: number }[]
) {
  if (values.length === 0) return [];
  return db
    .insert(chunks)
    .values(values.map((v) => ({ id: randomUUID(), documentId, ...v })))
    .returning();
}

export async function listChunksByDocument(documentId: string) {
  return db
    .select()
    .from(chunks)
    .where(eq(chunks.documentId, documentId))
    .orderBy(asc(chunks.position));
}
