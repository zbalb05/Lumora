import { randomUUID } from 'expo-crypto';
import { asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { chatMessages } from '@/db/schema';
import { enqueueSync } from '@/db/sync/enqueue';

export async function listMessages(studySetId: string | null) {
  return db
    .select()
    .from(chatMessages)
    .where(studySetId ? eq(chatMessages.studySetId, studySetId) : isNull(chatMessages.studySetId))
    .orderBy(asc(chatMessages.createdAt));
}

export async function createMessage(
  studySetId: string | null,
  role: 'user' | 'assistant',
  content: string
) {
  const [row] = await db
    .insert(chatMessages)
    .values({ id: randomUUID(), studySetId, role, content })
    .returning();
  await enqueueSync('chat_messages', row.id, 'insert', row);
  return row;
}

export async function clearMessages(studySetId: string | null) {
  const condition = studySetId
    ? eq(chatMessages.studySetId, studySetId)
    : isNull(chatMessages.studySetId);
  const deleted = await db.delete(chatMessages).where(condition).returning({ id: chatMessages.id });
  await Promise.all(deleted.map((row) => enqueueSync('chat_messages', row.id, 'delete')));
}
