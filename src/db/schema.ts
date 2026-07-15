import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const studySets = sqliteTable('study_sets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  studySetId: text('study_set_id')
    .notNull()
    .references(() => studySets.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sourceType: text('source_type', {
    enum: ['pdf', 'image', 'text'],
  }).notNull(),
  uri: text('uri').notNull(),
  status: text('status', { enum: ['pending', 'processing', 'ready', 'error'] })
    .notNull()
    .default('pending'),
  errorMessage: text('error_message'),
  flashcardsCompletedAt: text('flashcards_completed_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const chunks = sqliteTable('chunks', {
  id: text('id').primaryKey(),
  documentId: text('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  text: text('text').notNull(),
  page: integer('page'),
  timestampSec: integer('timestamp_sec'),
});

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  studySetId: text('study_set_id')
    .notNull()
    .references(() => studySets.id, { onDelete: 'cascade' }),
  documentId: text('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  markdown: text('markdown').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const flashcards = sqliteTable('flashcards', {
  id: text('id').primaryKey(),
  studySetId: text('study_set_id')
    .notNull()
    .references(() => studySets.id, { onDelete: 'cascade' }),
  documentId: text('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  front: text('front').notNull(),
  back: text('back').notNull(),
  dueAt: text('due_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  intervalDays: integer('interval_days').notNull().default(0),
  easeFactor: integer('ease_factor').notNull().default(250),
  lastReviewedAt: text('last_reviewed_at'),
});

export const quizzes = sqliteTable('quizzes', {
  id: text('id').primaryKey(),
  studySetId: text('study_set_id')
    .notNull()
    .references(() => studySets.id, { onDelete: 'cascade' }),
  documentId: text('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  completedAt: text('completed_at'),
  lastCorrectCount: integer('last_correct_count'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const quizQuestions = sqliteTable('quiz_questions', {
  id: text('id').primaryKey(),
  quizId: text('quiz_id')
    .notNull()
    .references(() => quizzes.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  choices: text('choices', { mode: 'json' }).notNull().$type<string[]>(),
  correctChoiceIndex: integer('correct_choice_index').notNull(),
  explanation: text('explanation').notNull(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  studySetId: text('study_set_id').references(() => studySets.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const goals = sqliteTable('goals', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  title: text('title').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  completedAt: text('completed_at'),
  // No SQL-level default: SQLite's ALTER TABLE ADD COLUMN rejects non-constant defaults like
  // CURRENT_TIMESTAMP outright (regardless of nullability), since it would need to backfill
  // existing rows with a per-row evaluated value. Set explicitly in application code on insert.
  createdAt: text('created_at'),
});

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  hour: integer('hour').notNull(),
  minute: integer('minute').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const activityLog = sqliteTable('activity_log', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  type: text('type', {
    enum: ['goal_completed', 'flashcard_reviewed', 'quiz_taken', 'document_uploaded'],
  }).notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

// Local-only outbox for Phase 3's sync layer: every insert/update/delete against a synced table
// enqueues one row here (via src/db/sync/enqueue.ts), which a background push later drains to
// Supabase. Never synced itself — this table's rows ARE the sync mechanism, not sync content.
export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  operation: text('operation', { enum: ['insert', 'update', 'delete'] }).notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

// Local-only pull watermarks (one row per synced table, tracking the newest remote `updated_at`
// already pulled down). Per-installation state, like syncQueue — never synced itself.
export const syncState = sqliteTable('sync_state', {
  tableName: text('table_name').primaryKey(),
  lastPulledAt: text('last_pulled_at').notNull(),
});
