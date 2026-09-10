-- =========================================================
-- STORM / Growbot — الاشتراك الإجباري
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
-- =========================================================

create table if not exists public.required_channels (
  id uuid primary key default gen_random_uuid(),

  chat_id bigint not null unique,

  chat_username text,
  title text not null,

  invite_link text,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_required_channels_active
on public.required_channels(is_active, created_at);

create or replace function public.set_required_channels_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_required_channels_updated_at
on public.required_channels;

create trigger trg_required_channels_updated_at
before update on public.required_channels
for each row
execute function public.set_required_channels_updated_at();

alter table public.required_channels enable row level security;

notify pgrst, 'reload schema';
