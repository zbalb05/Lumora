import { randomUUID } from 'expo-crypto';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { quizQuestions, quizzes } from '@/db/schema';
import { enqueueSync } from '@/db/sync/enqueue';

export async function createQuiz(
  studySetId: string,
  documentId: string,
  title: string,
  questions: { prompt: string; choices: string[]; correctChoiceIndex: number; explanation: string }[]
) {
  const [quiz] = await db.insert(quizzes).values({ id: randomUUID(), studySetId, documentId, title }).returning();
  await enqueueSync('quizzes', quiz.id, 'insert', quiz);

  if (questions.length > 0) {
    const rows = await db
      .insert(quizQuestions)
      .values(questions.map((q) => ({ id: randomUUID(), quizId: quiz.id, ...q })))
      .returning();
    await Promise.all(rows.map((row) => enqueueSync('quiz_questions', row.id, 'insert', row)));
  }

  return quiz;
}

export async function getQuizByDocument(documentId: string) {
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.documentId, documentId));
  if (!quiz) return undefined;

  const questions = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quiz.id));
  return { ...quiz, questions };
}

export async function completeQuiz(quizId: string, correctCount: number) {
  const [row] = await db
    .update(quizzes)
    .set({ completedAt: sql`(datetime('now'))`, lastCorrectCount: correctCount })
    .where(eq(quizzes.id, quizId))
    .returning();
  if (row) await enqueueSync('quizzes', quizId, 'update', row);
}
