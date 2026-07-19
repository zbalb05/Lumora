-- Adds lecture-recording support to documents: a new 'audio' source_type, plus an optional
-- slides attachment on the same row (a lecture is still exactly one document, not two — see
-- the 1:1 study_set:document invariant documented in src/db/queries/documents.ts).

alter table documents drop constraint documents_source_type_check;

alter table documents add constraint documents_source_type_check
  check (source_type in ('pdf', 'image', 'text', 'audio'));

alter table documents add column slides_uri text;

alter table documents add column slides_source_type text
  check (slides_source_type in ('pdf', 'image'));
