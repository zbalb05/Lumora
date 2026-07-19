import { logActivity } from '@/db/queries/activity';
import { insertChunks } from '@/db/queries/chunks';
import { createDocument, updateDocumentStatus, updateDocumentTitle } from '@/db/queries/documents';
import { createFlashcards } from '@/db/queries/flashcards';
import { createNote } from '@/db/queries/notes';
import { createQuiz } from '@/db/queries/quizzes';
import { createStudySet, updateStudySetTitle } from '@/db/queries/study-sets';
import type { documents } from '@/db/schema';
import {
  chunkTaggedText,
  generateLectureStudyMaterials,
  generateStudyMaterials,
  type GeneratedFlashcard,
  type GeneratedQuizQuestion,
} from '@/services/gemini';
import { extractHeading } from '@/utils/markdown';

export type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
  base64: () => Promise<string>;
};

function sourceTypeFor(mimeType: string): 'pdf' | 'image' | undefined {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  return undefined;
}

type DocumentRow = typeof documents.$inferSelect;

/**
 * Persists a generated study-materials result: chunks the tagged text (for local
 * storage/citations), then stores the note, flashcards, and quiz.
 */
async function persistResults(
  studySetId: string,
  document: DocumentRow,
  materials: { taggedText: string; summary: string; flashcards: GeneratedFlashcard[]; quiz: GeneratedQuizQuestion[] }
) {
  const chunks = chunkTaggedText(materials.taggedText);
  await insertChunks(document.id, chunks);

  await createNote(studySetId, document.id, materials.summary);
  await createFlashcards(studySetId, document.id, materials.flashcards);
  await createQuiz(studySetId, document.id, document.title, materials.quiz);
}

/**
 * Runs the full ingestion pipeline for a picked file: creates a study set + document row,
 * then extracts, chunks, summarizes, and generates flashcards/quiz — updating the document's
 * status as it goes so the UI can reflect progress.
 */
export async function ingestFile(file: PickedFile) {
  const sourceType = sourceTypeFor(file.mimeType);
  if (!sourceType) {
    throw new Error(`Unsupported file type: ${file.mimeType}. Try a PDF or image.`);
  }

  const studySet = await createStudySet(file.name);
  const document = await createDocument({
    studySetId: studySet.id,
    title: file.name,
    sourceType,
    uri: file.uri,
  });

  try {
    await updateDocumentStatus(document.id, 'processing');

    const base64 = await file.base64();
    const materials = await generateStudyMaterials(base64, file.mimeType);

    const title = extractHeading(materials.summary) ?? file.name;
    if (title !== document.title) {
      document.title = title;
      await Promise.all([updateStudySetTitle(studySet.id, title), updateDocumentTitle(document.id, title)]);
    }

    await persistResults(studySet.id, document, materials);

    await updateDocumentStatus(document.id, 'ready');
    await logActivity('document_uploaded', { documentId: document.id, title: document.title });
  } catch (error) {
    await updateDocumentStatus(
      document.id,
      'error',
      error instanceof Error ? error.message : 'Unknown error'
    );
    throw error;
  }

  return document;
}

export type PickedSlides = {
  uri: string;
  mimeType: string;
  base64: () => Promise<string>;
};

function slidesSourceTypeFor(mimeType: string): 'pdf' | 'image' | undefined {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  return undefined;
}

/**
 * Runs the lecture-recording ingestion pipeline: one document (sourceType 'audio'), optionally
 * carrying a slides attachment on the same row rather than a second document row — see the
 * 1:1 study-set:document invariant noted in db/queries/documents.ts. Mirrors ingestFile's
 * status-tracking/error-handling pattern; reuses persistResults unchanged.
 */
export async function ingestLecture(
  audioUri: string,
  audioMimeType: string,
  title: string,
  slides?: PickedSlides
) {
  const studySet = await createStudySet(title);
  const document = await createDocument({
    studySetId: studySet.id,
    title,
    sourceType: 'audio',
    uri: audioUri,
    slidesUri: slides?.uri ?? null,
    slidesSourceType: slides ? (slidesSourceTypeFor(slides.mimeType) ?? null) : null,
  });

  try {
    await updateDocumentStatus(document.id, 'processing');

    const slidesPart = slides
      ? { base64: await slides.base64(), mimeType: slides.mimeType }
      : undefined;
    const materials = await generateLectureStudyMaterials(audioUri, audioMimeType, slidesPart);

    const derivedTitle = extractHeading(materials.summary) ?? title;
    if (derivedTitle !== document.title) {
      document.title = derivedTitle;
      await Promise.all([
        updateStudySetTitle(studySet.id, derivedTitle),
        updateDocumentTitle(document.id, derivedTitle),
      ]);
    }

    await persistResults(studySet.id, document, materials);

    await updateDocumentStatus(document.id, 'ready');
    await logActivity('document_uploaded', {
      documentId: document.id,
      title: document.title,
      sourceType: 'audio',
    });
  } catch (error) {
    await updateDocumentStatus(
      document.id,
      'error',
      error instanceof Error ? error.message : 'Unknown error'
    );
    throw error;
  }

  return document;
}
