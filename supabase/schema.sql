-- gen-ai-drawing-app — save/load schema.
-- Paste this into the Supabase SQL editor (or run via `supabase db push`) on a fresh project.

create table if not exists public.drawings (
  id          text primary key,
  strokes     jsonb not null,
  prompt      text not null default '',
  image_path  text not null,
  created_at  timestamptz not null default now()
);

-- RLS enabled with no policies: the anon key is denied by default.
-- The app's server routes use the service-role key, which bypasses RLS.
alter table public.drawings enable row level security;

-- Public Storage bucket for the generated images.
-- Access model is "URL possession grants access" — same as the DB record.
insert into storage.buckets (id, name, public)
values ('drawings', 'drawings', true)
on conflict (id) do nothing;
