-- Mirrors the local SQLite schema (src/db/schema.ts) in Postgres, adding per-user ownership and
-- sync bookkeeping. Every table (except app_settings, which stays device-local) gets:
--   user_id    -- row ownership, enforced by RLS
--   updated_at -- server-clock timestamp, bumped by trigger; drives Phase 3's last-write-wins pull
--   deleted_at -- soft delete; Phase 3 applies a non-null value as a local hard-delete
-- Primary/foreign keys are native uuid (client-generated via expo-crypto's randomUUID(), which
-- produces standard RFC 4122 v4 UUIDs Postgres accepts natively).

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- study_sets ------------------------------------------------------------------------------

create table study_sets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger study_sets_set_updated_at
  before update on study_sets
  for each row execute function set_updated_at();

alter table study_sets enable row level security;

create policy "study_sets: owner full access" on study_sets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- documents ---------------------------------------------------------------------------------

create table documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  study_set_id uuid not null references study_sets(id) on delete cascade,
  title text not null,
  source_type text not null check (source_type in ('pdf', 'image', 'text')),
  uri text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'error')),
  error_message text,
  flashcards_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger documents_set_updated_at
  before update on documents
  for each row execute function set_updated_at();

alter table documents enable row level security;

create policy "documents: owner full access" on documents
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- chunks (extracted document text — syncs; the original source file does not, see plan) -----

create table chunks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  position integer not null,
  text text not null,
  page integer,
  timestamp_sec integer,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger chunks_set_updated_at
  before update on chunks
  for each row execute function set_updated_at();

alter table chunks enable row level security;

create policy "chunks: owner full access" on chunks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- notes -------------------------------------------------------------------------------------

create table notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  study_set_id uuid not null references study_sets(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  markdown text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger notes_set_updated_at
  before update on notes
  for each row execute function set_updated_at();

alter table notes enable row level security;

create policy "notes: owner full access" on notes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- flashcards ----------------------------------------------------------------------------------

create table flashcards (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  study_set_id uuid not null references study_sets(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  front text not null,
  back text not null,
  due_at timestamptz not null default now(),
  interval_days integer not null default 0,
  ease_factor integer not null default 250,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger flashcards_set_updated_at
  before update on flashcards
  for each row execute function set_updated_at();

alter table flashcards enable row level security;

create policy "flashcards: owner full access" on flashcards
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- quizzes + quiz_questions -------------------------------------------------------------------

create table quizzes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  study_set_id uuid not null references study_sets(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  title text not null,
  completed_at timestamptz,
  last_correct_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger quizzes_set_updated_at
  before update on quizzes
  for each row execute function set_updated_at();

alter table quizzes enable row level security;

create policy "quizzes: owner full access" on quizzes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table quiz_questions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references quizzes(id) on delete cascade,
  prompt text not null,
  choices jsonb not null,
  correct_choice_index integer not null,
  explanation text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger quiz_questions_set_updated_at
  before update on quiz_questions
  for each row execute function set_updated_at();

alter table quiz_questions enable row level security;

create policy "quiz_questions: owner full access" on quiz_questions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- chat_messages (study_set_id nullable = "general" chat, not scoped to a document) ------------

create table chat_messages (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  study_set_id uuid references study_sets(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger chat_messages_set_updated_at
  before update on chat_messages
  for each row execute function set_updated_at();

alter table chat_messages enable row level security;

create policy "chat_messages: owner full access" on chat_messages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- goals -----------------------------------------------------------------------------------------

create table goals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  title text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger goals_set_updated_at
  before update on goals
  for each row execute function set_updated_at();

alter table goals enable row level security;

create policy "goals: owner full access" on goals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- reminders -------------------------------------------------------------------------------------

create table reminders (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  hour integer not null,
  minute integer not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger reminders_set_updated_at
  before update on reminders
  for each row execute function set_updated_at();

alter table reminders enable row level security;

create policy "reminders: owner full access" on reminders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- activity_log ----------------------------------------------------------------------------------

create table activity_log (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  type text not null check (type in ('goal_completed', 'flashcard_reviewed', 'quiz_taken', 'document_uploaded')),
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger activity_log_set_updated_at
  before update on activity_log
  for each row execute function set_updated_at();

alter table activity_log enable row level security;

create policy "activity_log: owner full access" on activity_log
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes for the columns Phase 3's sync layer will query most (per-user pull ordered by updated_at) --

create index study_sets_user_updated_idx on study_sets (user_id, updated_at);
create index documents_user_updated_idx on documents (user_id, updated_at);
create index chunks_user_updated_idx on chunks (user_id, updated_at);
create index notes_user_updated_idx on notes (user_id, updated_at);
create index flashcards_user_updated_idx on flashcards (user_id, updated_at);
create index quizzes_user_updated_idx on quizzes (user_id, updated_at);
create index quiz_questions_user_updated_idx on quiz_questions (user_id, updated_at);
create index chat_messages_user_updated_idx on chat_messages (user_id, updated_at);
create index goals_user_updated_idx on goals (user_id, updated_at);
create index reminders_user_updated_idx on reminders (user_id, updated_at);
create index activity_log_user_updated_idx on activity_log (user_id, updated_at);
