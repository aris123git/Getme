-- ═══════════════════════════════════════════════════════════
-- GETME — Créer la table "calls" (+ push)
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- Table des appels vidéo 1-1
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'ended', 'missed', 'rejected')),
  mode text not null default 'webrtc'
    check (mode in ('webrtc', 'daily')),
  room_name text,
  room_url text,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);

create index if not exists calls_callee_status_idx on public.calls (callee_id, status);
create index if not exists calls_caller_idx on public.calls (caller_id);

-- Abonnements notifications navigateur
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Sécurité (RLS)
alter table public.calls enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "calls_select_participants" on public.calls;
create policy "calls_select_participants" on public.calls
  for select using (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists "calls_insert_caller" on public.calls;
create policy "calls_insert_caller" on public.calls
  for insert with check (auth.uid() = caller_id);

drop policy if exists "calls_update_participants" on public.calls;
create policy "calls_update_participants" on public.calls
  for update using (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists "push_select_own" on public.push_subscriptions;
create policy "push_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "push_insert_own" on public.push_subscriptions;
create policy "push_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "push_update_own" on public.push_subscriptions;
create policy "push_update_own" on public.push_subscriptions
  for update using (auth.uid() = user_id);

drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- Realtime (appels entrants en direct)
alter table public.calls replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.calls;
  exception when duplicate_object then
    null;
  end;
end $$;

-- Vérification
select 'OK — table calls prête' as result;
