import {
  FileState,
  GoogleGenAI,
  Type,
  createPartFromBase64,
  createPartFromUri,
  createUserContent,
  type Part,
} from '@google/genai';

// 'gemini-flash-latest' is Google's rolling alias for the current stable flash-tier model —
// pinned version numbers (e.g. gemini-2.5-flash) get sunset for new API keys over time.
const MODEL = 'gemini-flash-latest';

// Gemini 2.5 flash models "think" before answering by default, which adds real latency for a
// use case (extraction, structured generation, chat replies) that doesn't need deep reasoning.
// Disabling it is the single biggest lever for response speed.
const NO_THINKING = { thinkingConfig: { thinkingBudget: 0 } };

function client() {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'EXPO_PUBLIC_GEMINI_API_KEY is not set. Add it to a .env file (see .env.example).'
    );
  }
  return new GoogleGenAI({ apiKey });
}

/** Turns a raw Gemini API error (often a JSON string) into a short, readable message. */
function toFriendlyError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(raw);
    const apiError = parsed?.error;
    if (apiError?.code === 429 || apiError?.status === 'RESOURCE_EXHAUSTED') {
      return new Error(
        "You've hit the Gemini API's free-tier request limit for today. Wait for it to reset " +
          '(usually the next day) or upgrade your plan at ai.google.dev/gemini-api/docs/rate-limits.'
      );
    }
    if (typeof apiError?.message === 'string') {
      return new Error(apiError.message);
    }
  } catch {
    // Not a JSON error body — fall through to the raw message.
  }
  return error instanceof Error ? error : new Error(raw);
}

async function generateContent(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0]
) {
  try {
    return await ai.models.generateContent(params);
  } catch (error) {
    throw toFriendlyError(error);
  }
}

export interface TaggedChunk {
  position: number;
  text: string;
  page?: number;
  timestampSec?: number;
}

/** Splits [Page:/Timestamp:]-tagged text into ~500-1000 word chunks, carrying the last seen tag. */
export function chunkTaggedText(taggedText: string): TaggedChunk[] {
  const lines = taggedText.split('\n');
  const pageTag = /^\[Page:\s*(\d+)\]$/i;
  const timeTag = /^\[Timestamp:\s*(\d+):(\d+)\]$/i;

  const chunks: TaggedChunk[] = [];
  let buffer: string[] = [];
  let wordCount = 0;
  let page: number | undefined;
  let timestampSec: number | undefined;

  const flush = () => {
    if (buffer.length === 0) return;
    chunks.push({ position: chunks.length, text: buffer.join('\n').trim(), page, timestampSec });
    buffer = [];
    wordCount = 0;
  };

  for (const line of lines) {
    const pageMatch = line.match(pageTag);
    const timeMatch = line.match(timeTag);
    if (pageMatch) page = Number(pageMatch[1]);
    if (timeMatch) timestampSec = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);

    buffer.push(line);
    wordCount += line.split(/\s+/).filter(Boolean).length;

    if (wordCount >= 800) flush();
  }
  flush();

  return chunks;
}

export interface GeneratedFlashcard {
  front: string;
  back: string;
}

export interface GeneratedQuizQuestion {
  prompt: string;
  choices: string[];
  correctChoiceIndex: number;
  explanation: string;
}

export interface StudyMaterials {
  taggedText: string;
  summary: string;
  flashcards: GeneratedFlashcard[];
  quiz: GeneratedQuizQuestion[];
}

// Shared by generateStudyMaterials and generateLectureStudyMaterials — same output shape either way.
const STUDY_MATERIALS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    taggedText: { type: Type.STRING },
    summary: { type: Type.STRING },
    flashcards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          front: { type: Type.STRING },
          back: { type: Type.STRING },
        },
        required: ['front', 'back'],
      },
    },
    quiz: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          prompt: { type: Type.STRING },
          choices: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctChoiceIndex: { type: Type.INTEGER },
          explanation: { type: Type.STRING },
        },
        required: ['prompt', 'choices', 'correctChoiceIndex', 'explanation'],
      },
    },
  },
  required: ['taggedText', 'summary', 'flashcards', 'quiz'],
};

function parseStudyMaterials(text: string | undefined, emptyMessage: string): StudyMaterials {
  const parsed = JSON.parse(text ?? '{}');
  if (!parsed.taggedText || !parsed.summary) {
    throw new Error(emptyMessage);
  }
  return {
    taggedText: parsed.taggedText,
    summary: parsed.summary,
    flashcards: parsed.flashcards ?? [],
    quiz: parsed.quiz ?? [],
  };
}

/**
 * Extracts the uploaded document AND generates its summary, flashcards, and quiz in one Gemini
 * call. This used to be two sequential round trips (extract text, then feed that text back in
 * for summarization) — folded into one because the second call was just re-paying input-token
 * cost to re-read text the model had already produced once, roughly doubling wall-clock time for
 * every upload. One multimodal call now does both in a single pass.
 */
export async function generateStudyMaterials(base64: string, mimeType: string): Promise<StudyMaterials> {
  const response = await generateContent(client(), {
    model: MODEL,
    contents: createUserContent([
      createPartFromBase64(base64, mimeType),
      'This is a document (PDF or image) of a student\'s study material. First extract its ' +
        'full text, preserving reading order across columns and slides; tag the start of each ' +
        'page or slide on its own line as "[Page: N]" (1-indexed). ' +
        'Put that tagged text verbatim in "taggedText". Then, from that same text, ' +
        'produce three more things, keeping each concise so the response stays fast to generate:\n' +
        '1) "summary": a cohesive, hierarchical summary using ### headers and "- " bullet points ' +
        '(aim for well under half the length of the source), preserving [Page:]/[Timestamp:] tags ' +
        'inline so each point stays traceable to its source. Write plain text within headers and ' +
        'bullets — no markdown emphasis like **bold** or *italic*.\n' +
        '2) "flashcards": at most 15 cards. Scan the text for the single most important named ' +
        'entities, strict definitions, and causal relationships, and produce front/back ' +
        'question-answer pairs, one per fact, skipping anything trivial or ambiguous.\n' +
        '3) "quiz": 5-8 questions. Review the most critical overarching themes and draft a mix of ' +
        'multiple-choice and true/false questions based strictly on facts present in the text ' +
        '(true/false questions use exactly two choices: "True" and "False"), each with the ' +
        'correct choice index and a brief explanation.',
    ]),
    config: {
      ...NO_THINKING,
      responseMimeType: 'application/json',
      responseSchema: STUDY_MATERIALS_SCHEMA,
    },
  });

  return parseStudyMaterials(response.text, 'Gemini returned no study material for this upload.');
}

/** Polls a just-uploaded Gemini file until it's ready to reference in a generateContent call —
 * required for audio/video, which aren't immediately usable the moment upload() resolves. */
async function uploadAndAwaitActive(ai: GoogleGenAI, file: Blob, mimeType: string) {
  let uploaded = await ai.files.upload({ file, config: { mimeType } });
  const deadline = Date.now() + 5 * 60_000;
  while (uploaded.state === FileState.PROCESSING) {
    if (Date.now() > deadline) {
      throw new Error('Gemini took too long to process the recording. Try again in a moment.');
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    uploaded = await ai.files.get({ name: uploaded.name! });
  }
  if (uploaded.state === FileState.FAILED || !uploaded.uri || !uploaded.mimeType) {
    throw new Error('Gemini could not process the uploaded recording.');
  }
  return uploaded;
}

/**
 * Cross-references a recorded lecture with its optional slides in one multimodal call, tagging
 * spoken content with [Timestamp: MM:SS] and slide content with [Page: N] in the same taggedText
 * output. Audio goes through the Files API (uploadAndAwaitActive) rather than inline base64 like
 * generateStudyMaterials — a real lecture recording routinely exceeds Gemini's 20MB inline-request
 * cap, while the (much smaller) slides file stays inline alongside it in the same request.
 */
export async function generateLectureStudyMaterials(
  audioUri: string,
  audioMimeType: string,
  slides?: { base64: string; mimeType: string }
): Promise<StudyMaterials> {
  const ai = client();
  const audioBlob = await (await fetch(audioUri)).blob();
  const file = await uploadAndAwaitActive(ai, audioBlob, audioMimeType);

  const parts: (Part | string)[] = [createPartFromUri(file.uri!, file.mimeType!)];
  if (slides) parts.push(createPartFromBase64(slides.base64, slides.mimeType));
  parts.push(
    slides
      ? 'The first attachment is an audio recording of a live lecture. The second attachment is ' +
          'that lecture\'s slides (PDF or images). Cross-reference them: when the speaker discusses ' +
          'content from a specific slide, tag that passage with the slide\'s "[Page: N]"; for spoken ' +
          'content with no matching slide (asides, Q&A, extra explanation), tag it with ' +
          '"[Timestamp: MM:SS]" instead, one tag per line, in chronological (spoken) order. Note ' +
          'explicitly in the notes anywhere the spoken lecture adds to, corrects, or contradicts a slide.'
      : 'This is an audio recording of a live lecture with no slides attached. Produce a condensed, ' +
          'topic-segmented account of what was said — not a verbatim transcript — tagging the start ' +
          'of each new topic or major point on its own line as "[Timestamp: MM:SS]" (mm:ss from the ' +
          'start of the recording).'
  );
  parts.push(
    'Put that tagged text verbatim in "taggedText". Then, from that same text, produce three more ' +
      'things, keeping each concise so the response stays fast to generate:\n' +
      '1) "summary": a cohesive, hierarchical summary using ### headers and "- " bullet points ' +
      '(aim for well under half the length of the source), preserving [Page:]/[Timestamp:] tags ' +
      'inline so each point stays traceable to its source. Write plain text within headers and ' +
      'bullets — no markdown emphasis like **bold** or *italic*.\n' +
      '2) "flashcards": at most 15 cards. Scan the text for the single most important named ' +
      'entities, strict definitions, and causal relationships, and produce front/back ' +
      'question-answer pairs, one per fact, skipping anything trivial or ambiguous.\n' +
      '3) "quiz": 5-8 questions. Review the most critical overarching themes and draft a mix of ' +
      'multiple-choice and true/false questions based strictly on facts present in the text ' +
      '(true/false questions use exactly two choices: "True" and "False"), each with the correct ' +
      'choice index and a brief explanation.'
  );

  const response = await generateContent(ai, {
    model: MODEL,
    contents: createUserContent(parts),
    config: {
      ...NO_THINKING,
      responseMimeType: 'application/json',
      responseSchema: STUDY_MATERIALS_SCHEMA,
    },
  });

  return parseStudyMaterials(response.text, 'Gemini returned no study material for this recording.');
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * AI Tutor: answers questions grounded in a study set's stored notes when one is given, or
 * general academic questions otherwise. v1 keeps this simple — the full notes are stuffed in
 * as a system instruction rather than retrieved via embeddings/vector search. `attachment` (an
 * image the student attached) is only ever applied to the last turn — the one currently being sent.
 */
export async function chat(
  context: string | null,
  history: ChatTurn[],
  attachment?: { base64: string; mimeType: string },
  abortSignal?: AbortSignal
): Promise<string> {
  const lastIndex = history.length - 1;
  const response = await generateContent(client(), {
    model: MODEL,
    contents: history.map((turn, index) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts:
        attachment && index === lastIndex
          ? [createPartFromBase64(attachment.base64, attachment.mimeType), { text: turn.content }]
          : [{ text: turn.content }],
    })),
    config: {
      ...NO_THINKING,
      abortSignal,
      systemInstruction: context
        ? 'You are a study tutor. Answer questions using the notes below, which were generated ' +
          'from the student\'s own uploaded material. If the notes don\'t cover something, say so ' +
          `before answering from general knowledge.\n\n${context}`
        : 'You are a friendly, encouraging study tutor. Answer academic questions clearly and concisely.',
    },
  });
  const text = response.text;
  if (!text) throw new Error('Gemini returned no text for the chat reply.');
  return text;
}
