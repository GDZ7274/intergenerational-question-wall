-- Operational controls for anonymous submissions.
--
-- Public RPC contract (anon and authenticated):
--   submit_question(p_session_id text, p_author_role text, p_body text,
--                   p_anonymous boolean default true) -> jsonb
--   submit_answer(p_session_id text, p_question_id uuid, p_author_role text,
--                 p_body text, p_anonymous boolean default true) -> jsonb
--   submit_report(p_session_id text, p_note_id uuid,
--                 p_reason text default 'other') -> jsonb
--   get_submission_status(p_receipt text) -> jsonb
--   resubmit_question(p_receipt text, p_body text,
--                     p_anonymous boolean default null) -> jsonb
--   resubmit_answer(p_receipt text, p_body text,
--                   p_anonymous boolean default null) -> jsonb
--   public_runtime_status() -> jsonb
--
-- Moderator RPC contract (authenticated and allow-listed):
--   admin_get_runtime_settings() -> jsonb                 -- owner/reviewer
--   admin_update_runtime_settings(boolean, boolean,
--                                 boolean, text) -> jsonb -- owner only
--
-- Successful submissions return {ok, id, receipt, status, createdAt}.
-- A receipt is a 256-bit bearer secret. Only its SHA-256 digest is stored.
-- Rate-limit and runtime-state refusals return {ok:false,error,message,...}
-- without rolling back the persistent abuse counter.
-- Existing submissions are intentionally not backfilled: there is no safe way
-- to prove which anonymous visitor should receive an old bearer receipt.
-- Callers must persist a successful receipt immediately. These RPCs do not yet
-- accept a client idempotency key, so a lost success response can be retried as
-- a distinct submission.

begin;

create schema if not exists question_wall_private;
revoke all on schema question_wall_private from public, anon, authenticated;

create table if not exists public.runtime_settings (
  singleton boolean primary key default true check (singleton),
  submissions_paused boolean not null default false,
  read_only boolean not null default false,
  emergency_lockdown boolean not null default false,
  public_message text check (
    public_message is null or char_length(public_message) <= 160
  ),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.runtime_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.submission_receipts (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  entity_type text not null check (entity_type in ('question', 'answer')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '365 days'),
  last_accessed_at timestamptz,
  revoked_at timestamptz,
  unique (entity_type, entity_id),
  check (expires_at > created_at)
);

create table if not exists public.submission_events (
  id bigint generated always as identity primary key,
  receipt_id uuid not null references public.submission_receipts(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'submitted',
      'approved',
      'rejected',
      'resubmitted',
      'published',
      'hidden',
      'closed',
      'reopened',
      'answer_received',
      'featured'
    )
  ),
  message text not null check (char_length(message) between 1 and 200),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.abuse_rate_buckets (
  key_hash bytea not null,
  action text not null check (
    action in ('question', 'answer', 'report', 'resubmit')
  ),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (key_hash, action)
);

create index if not exists submission_receipts_entity_idx
  on public.submission_receipts (entity_type, entity_id);
create index if not exists submission_receipts_expiry_idx
  on public.submission_receipts (expires_at)
  where revoked_at is null;
create index if not exists submission_events_receipt_idx
  on public.submission_events (receipt_id, created_at desc);
create index if not exists abuse_rate_buckets_cleanup_idx
  on public.abuse_rate_buckets (updated_at);

alter table public.questions
  add column if not exists submitter_feedback text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists resubmitted_at timestamptz,
  add column if not exists submission_revision integer not null default 1;

alter table public.questions
  drop constraint if exists questions_submitter_feedback_check;
alter table public.questions
  add constraint questions_submitter_feedback_check
  check (submitter_feedback is null or char_length(submitter_feedback) <= 500);
alter table public.questions
  drop constraint if exists questions_submission_revision_check;
alter table public.questions
  add constraint questions_submission_revision_check
  check (submission_revision >= 1);

alter table public.answers
  add column if not exists submitter_feedback text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists resubmitted_at timestamptz,
  add column if not exists submission_revision integer not null default 1;

alter table public.answers
  drop constraint if exists answers_submitter_feedback_check;
alter table public.answers
  add constraint answers_submitter_feedback_check
  check (submitter_feedback is null or char_length(submitter_feedback) <= 500);
alter table public.answers
  drop constraint if exists answers_submission_revision_check;
alter table public.answers
  add constraint answers_submission_revision_check
  check (submission_revision >= 1);

-- Settings changes are privileged moderation actions and remain auditable.
alter table public.moderation_actions
  drop constraint if exists moderation_actions_entity_type_check;
alter table public.moderation_actions
  add constraint moderation_actions_entity_type_check
  check (entity_type in ('question', 'answer', 'report', 'settings'));

alter table public.runtime_settings enable row level security;
alter table public.submission_receipts enable row level security;
alter table public.submission_events enable row level security;
alter table public.abuse_rate_buckets enable row level security;

revoke all on public.runtime_settings from anon, authenticated;
revoke all on public.submission_receipts from anon, authenticated;
revoke all on public.submission_events from anon, authenticated;
revoke all on public.abuse_rate_buckets from anon, authenticated;

-- Retire the forgeable direct-write surface from 0001/0002. All anonymous
-- mutations now pass through SECURITY DEFINER RPCs below.
drop policy if exists experience_insert_questions on public.questions;
drop policy if exists experience_insert_answers on public.answers;
drop policy if exists experience_insert_reports on public.reports;
revoke insert on public.questions from anon, authenticated;
revoke insert on public.answers from anon, authenticated;
revoke insert on public.reports from anon, authenticated;

create or replace function question_wall_private.session_fingerprint(
  p_session_id text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  clean_session text := btrim(coalesce(p_session_id, ''));
begin
  if char_length(clean_session) not between 8 and 128
     or clean_session !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'invalid anonymous session id' using errcode = '22023';
  end if;

  return encode(
    sha256(convert_to('question-wall/session/v1:' || clean_session, 'UTF8')),
    'hex'
  );
end;
$$;

create or replace function question_wall_private.receipt_hash(
  p_receipt text
)
returns bytea
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  clean_receipt text := lower(btrim(coalesce(p_receipt, '')));
begin
  if clean_receipt !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  return sha256(convert_to(clean_receipt, 'UTF8'));
end;
$$;

create or replace function question_wall_private.clean_submission_body(
  p_body text,
  p_min_length integer,
  p_max_length integer
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  clean_body text;
begin
  clean_body := regexp_replace(
    btrim(coalesce(p_body, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if char_length(clean_body) not between p_min_length and p_max_length then
    raise exception 'submission length is outside the allowed range'
      using errcode = '22001';
  end if;

  if clean_body ~ '[<>]'
     or clean_body ~* '(https?://|www\.)'
     or clean_body ~* '[[:alnum:]_.%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}'
     or clean_body ~ '(^|[^0-9])1[3-9][0-9]{9}([^0-9]|$)' then
    raise exception 'submission contains contact details or unsupported markup'
      using errcode = '22023';
  end if;

  return clean_body;
end;
$$;

create or replace function question_wall_private.request_network_key()
returns text
language plpgsql
volatile
set search_path = pg_catalog, public, pg_temp
as $$
declare
  raw_headers text;
  headers jsonb;
  address text;
begin
  -- Supabase's gateway normally supplies one of these headers. Treat the value
  -- only as a secondary abuse signal: deployment-specific proxies may omit it,
  -- and the session-derived bucket remains the deterministic control.
  raw_headers := nullif(current_setting('request.headers', true), '');
  if raw_headers is null then
    return null;
  end if;

  begin
    headers := raw_headers::jsonb;
  exception when others then
    return null;
  end;

  address := split_part(
    coalesce(
      nullif(headers ->> 'cf-connecting-ip', ''),
      nullif(headers ->> 'x-forwarded-for', '')
    ),
    ',',
    1
  );
  address := btrim(coalesce(address, ''));

  if address = '' then
    return null;
  end if;

  return address;
end;
$$;

create or replace function question_wall_private.consume_rate_limit(
  p_action text,
  p_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  limit_count integer;
  window_seconds integer;
  block_seconds integer;
  session_key bytea;
  network_key bytea;
  current_key bytea;
  current_bucket public.abuse_rate_buckets%rowtype;
  inserted boolean;
  allowed boolean := true;
  retry_after integer := 0;
  now_at timestamptz := clock_timestamp();
begin
  case p_action
    when 'question' then
      limit_count := 5;
      window_seconds := 600;
      block_seconds := 900;
    when 'answer' then
      limit_count := 10;
      window_seconds := 600;
      block_seconds := 900;
    when 'report' then
      limit_count := 20;
      window_seconds := 86400;
      block_seconds := 3600;
    when 'resubmit' then
      limit_count := 5;
      window_seconds := 3600;
      block_seconds := 1800;
    else
      raise exception 'unsupported rate-limit action' using errcode = '22023';
  end case;

  session_key := sha256(convert_to(
    'question-wall/rate/session/v1:' || btrim(coalesce(p_session_id, '')),
    'UTF8'
  ));

  if question_wall_private.request_network_key() is not null then
    network_key := sha256(convert_to(
      'question-wall/rate/network/v1:' ||
      question_wall_private.request_network_key(),
      'UTF8'
    ));
  end if;

  foreach current_key in array array[session_key, network_key]
  loop
    if current_key is null then
      continue;
    end if;

    inserted := false;
    insert into public.abuse_rate_buckets
      (key_hash, action, window_started_at, request_count, updated_at)
    values
      (current_key, p_action, now_at, 1, now_at)
    on conflict (key_hash, action) do nothing
    returning true into inserted;

    if inserted then
      continue;
    end if;

    select * into current_bucket
    from public.abuse_rate_buckets
    where key_hash = current_key
      and action = p_action
    for update;

    if current_bucket.blocked_until is not null
       and current_bucket.blocked_until > now_at then
      allowed := false;
      retry_after := greatest(
        retry_after,
        ceil(extract(epoch from (current_bucket.blocked_until - now_at)))::integer
      );
    elsif current_bucket.window_started_at <=
          now_at - make_interval(secs => window_seconds) then
      update public.abuse_rate_buckets
      set window_started_at = now_at,
          request_count = 1,
          blocked_until = null,
          updated_at = now_at
      where key_hash = current_key
        and action = p_action;
    elsif current_bucket.request_count >= limit_count then
      allowed := false;
      retry_after := greatest(retry_after, block_seconds);

      update public.abuse_rate_buckets
      set request_count = request_count + 1,
          blocked_until = now_at + make_interval(secs => block_seconds),
          updated_at = now_at
      where key_hash = current_key
        and action = p_action;
    else
      update public.abuse_rate_buckets
      set request_count = request_count + 1,
          updated_at = now_at
      where key_hash = current_key
        and action = p_action;
    end if;
  end loop;

  return jsonb_build_object(
    'allowed', allowed,
    'retryAfter', retry_after
  );
end;
$$;

create or replace function question_wall_private.submission_gate(
  p_action text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  settings public.runtime_settings%rowtype;
begin
  select * into settings
  from public.runtime_settings
  where singleton;

  if not found or settings.emergency_lockdown then
    return jsonb_build_object(
      'ok', false,
      'error', 'emergency_lockdown',
      'message', coalesce(settings.public_message, '服务暂时不可用')
    );
  end if;

  if settings.read_only then
    return jsonb_build_object(
      'ok', false,
      'error', 'read_only',
      'message', coalesce(settings.public_message, '当前为只读模式')
    );
  end if;

  if p_action in ('question', 'answer', 'resubmit')
     and settings.submissions_paused then
    return jsonb_build_object(
      'ok', false,
      'error', 'submissions_paused',
      'message', coalesce(settings.public_message, '投稿暂时关闭')
    );
  end if;

  return null;
end;
$$;

create or replace function question_wall_private.create_receipt(
  p_entity_type text,
  p_entity_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  token text;
  attempt integer;
begin
  for attempt in 1..5 loop
    token := lower(
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '')
    );

    begin
      insert into public.submission_receipts
        (token_hash, entity_type, entity_id)
      values
        (
          sha256(convert_to(token, 'UTF8')),
          p_entity_type,
          p_entity_id
        );
      return token;
    exception when unique_violation then
      -- A token collision is vanishingly unlikely; retry without leaking it.
    end;
  end loop;

  raise exception 'unable to create submission receipt' using errcode = 'P0001';
end;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.moderator_accounts account
    where account.user_id = (select auth.uid())
      and account.enabled
      and account.role = 'owner'
  );
$$;

create or replace function public.assert_owner()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.is_owner() then
    raise exception 'owner access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.validate_experience_question()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.body := btrim(new.body);

  if coalesce(auth.role(), '') = 'anon' then
    if coalesce(current_setting('question_wall.submission_rpc', true), '') <> '1' then
      raise exception 'direct anonymous inserts are disabled' using errcode = '42501';
    end if;

    new.status := 'pending';
    new.source := 'user';
    new.created_at := now();
    new.updated_at := now();
    new.moderated_at := null;
    new.moderated_by := null;
    new.moderation_reason := null;
    new.submitter_feedback := null;
    new.submission_revision := 1;
  end if;

  return new;
end;
$$;

create or replace function public.validate_experience_answer()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  expected_role text;
  question_session_id text;
  question_status text;
begin
  new.body := btrim(new.body);

  select target_role, author_session_id, status
    into expected_role, question_session_id, question_status
  from public.questions
  where id = new.question_id;

  if not found then
    raise exception 'question not found' using errcode = '23503';
  end if;

  if coalesce(auth.role(), '') = 'anon' then
    if coalesce(current_setting('question_wall.submission_rpc', true), '') <> '1' then
      raise exception 'direct anonymous inserts are disabled' using errcode = '42501';
    end if;

    if question_status <> 'open' then
      raise exception 'question is not open' using errcode = '23514';
    end if;

    new.status := 'pending';
    new.featured := false;
    new.created_at := now();
    new.updated_at := now();
    new.moderated_at := null;
    new.moderated_by := null;
    new.moderation_reason := null;
    new.submitter_feedback := null;
    new.submission_revision := 1;
  end if;

  if expected_role <> new.author_role then
    raise exception 'answer role does not match question target' using errcode = '23514';
  end if;

  if question_session_id = new.author_session_id then
    raise exception 'cannot answer your own question' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.validate_experience_report()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.answers answer
    join public.questions question on question.id = answer.question_id
    where answer.id = new.target_id
      and answer.status = 'published'
      and question.status in ('open', 'closed')
  ) then
    raise exception 'published note not found' using errcode = '23503';
  end if;

  if coalesce(auth.role(), '') = 'anon' then
    if coalesce(current_setting('question_wall.submission_rpc', true), '') <> '1' then
      raise exception 'direct anonymous inserts are disabled' using errcode = '42501';
    end if;

    new.target_type := 'note';
    new.status := 'open';
    new.created_at := now();
    new.resolved_at := null;
    new.resolved_by := null;
    new.resolution_note := null;
  end if;

  return new;
end;
$$;

create or replace function question_wall_private.prepare_question_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at := now();

  if new.status is distinct from old.status then
    if new.status = 'rejected' then
      new.submitter_feedback := coalesce(
        nullif(btrim(new.moderation_reason), ''),
        '内容暂未通过，请修改后重新提交。'
      );
    elsif new.status = 'hidden' then
      new.submitter_feedback := '该内容已暂时隐藏。';
    elsif new.status in ('pending', 'open') then
      new.submitter_feedback := null;
    end if;
  end if;

  return new;
end;
$$;

create or replace function question_wall_private.prepare_answer_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at := now();

  if new.status is distinct from old.status then
    if new.status = 'rejected' then
      new.submitter_feedback := coalesce(
        nullif(btrim(new.moderation_reason), ''),
        '内容暂未通过，请修改后重新提交。'
      );
    elsif new.status = 'hidden' then
      new.submitter_feedback := '该内容已暂时隐藏。';
    elsif new.status in ('pending', 'published') then
      new.submitter_feedback := null;
    end if;
  end if;

  return new;
end;
$$;

create or replace function question_wall_private.record_question_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  receipt_id uuid;
  event_name text;
  event_message text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select receipt.id into receipt_id
  from public.submission_receipts receipt
  where receipt.entity_type = 'question'
    and receipt.entity_id = new.id
    and receipt.revoked_at is null;

  if receipt_id is null then
    return new;
  end if;

  if old.status = 'rejected' and new.status = 'pending' then
    event_name := 'resubmitted';
    event_message := '问题已重新提交审核。';
  elsif new.status = 'open' and old.status = 'pending' then
    event_name := 'approved';
    event_message := '问题已通过审核并进入问题池。';
  elsif new.status = 'rejected' then
    event_name := 'rejected';
    event_message := coalesce(new.submitter_feedback, '问题暂未通过审核。');
  elsif new.status = 'hidden' then
    event_name := 'hidden';
    event_message := '问题已暂时隐藏。';
  elsif new.status = 'closed' then
    event_name := 'closed';
    event_message := '问题已停止接收新回答。';
  elsif new.status = 'open' then
    event_name := 'reopened';
    event_message := '问题已重新开放回答。';
  else
    return new;
  end if;

  insert into public.submission_events
    (receipt_id, event_type, message, payload)
  values
    (
      receipt_id,
      event_name,
      event_message,
      jsonb_build_object('status', new.status, 'revision', new.submission_revision)
    );

  return new;
end;
$$;

create or replace function question_wall_private.record_answer_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  answer_receipt_id uuid;
  question_receipt_id uuid;
  event_name text;
  event_message text;
begin
  if new.status is distinct from old.status then
    select receipt.id into answer_receipt_id
    from public.submission_receipts receipt
    where receipt.entity_type = 'answer'
      and receipt.entity_id = new.id
      and receipt.revoked_at is null;

    if old.status = 'rejected' and new.status = 'pending' then
      event_name := 'resubmitted';
      event_message := '回答已重新提交审核。';
    elsif new.status = 'published' and old.status = 'pending' then
      event_name := 'approved';
      event_message := '回答已通过审核并发布。';
    elsif new.status = 'rejected' then
      event_name := 'rejected';
      event_message := coalesce(new.submitter_feedback, '回答暂未通过审核。');
    elsif new.status = 'hidden' then
      event_name := 'hidden';
      event_message := '回答已暂时隐藏。';
    elsif new.status = 'published' then
      event_name := 'published';
      event_message := '回答已重新发布。';
    end if;

    if answer_receipt_id is not null and event_name is not null then
      insert into public.submission_events
        (receipt_id, event_type, message, payload)
      values
        (
          answer_receipt_id,
          event_name,
          event_message,
          jsonb_build_object('status', new.status, 'revision', new.submission_revision)
        );
    end if;

    if new.status = 'published' and old.status <> 'published' then
      select receipt.id into question_receipt_id
      from public.submission_receipts receipt
      where receipt.entity_type = 'question'
        and receipt.entity_id = new.question_id
        and receipt.revoked_at is null;

      if question_receipt_id is not null then
        insert into public.submission_events
          (receipt_id, event_type, message, payload)
        values
          (
            question_receipt_id,
            'answer_received',
            '你的问题收到了一条新回答。',
            jsonb_build_object('answerId', new.id)
          );
      end if;
    end if;
  end if;

  if new.featured and not old.featured then
    if answer_receipt_id is null then
      select receipt.id into answer_receipt_id
      from public.submission_receipts receipt
      where receipt.entity_type = 'answer'
        and receipt.entity_id = new.id
        and receipt.revoked_at is null;
    end if;

    if answer_receipt_id is not null then
      insert into public.submission_events
        (receipt_id, event_type, message, payload)
      values
        (answer_receipt_id, 'featured', '你的回答已被设为精选。', '{}'::jsonb);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_question_update_trigger on public.questions;
create trigger prepare_question_update_trigger
before update on public.questions
for each row execute function question_wall_private.prepare_question_update();

drop trigger if exists prepare_answer_update_trigger on public.answers;
create trigger prepare_answer_update_trigger
before update on public.answers
for each row execute function question_wall_private.prepare_answer_update();

drop trigger if exists record_question_event_trigger on public.questions;
create trigger record_question_event_trigger
after update of status on public.questions
for each row execute function question_wall_private.record_question_event();

drop trigger if exists record_answer_event_trigger on public.answers;
create trigger record_answer_event_trigger
after update of status, featured on public.answers
for each row execute function question_wall_private.record_answer_event();

create or replace function public.public_runtime_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'schemaVersion', 3,
    'submissionsPaused', settings.submissions_paused,
    'readOnly', settings.read_only,
    'emergencyLockdown', settings.emergency_lockdown,
    'publicMessage', settings.public_message
  )
  from public.runtime_settings settings
  where settings.singleton;
$$;

create or replace function public.moderation_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select public.public_runtime_status() || jsonb_build_object(
    'submissionsRequireReview', true
  );
$$;

create or replace function public.admin_get_runtime_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.assert_moderator();

  select jsonb_build_object(
    'submissionsPaused', settings.submissions_paused,
    'readOnly', settings.read_only,
    'emergencyLockdown', settings.emergency_lockdown,
    'publicMessage', settings.public_message,
    'updatedAt', settings.updated_at
  ) into result
  from public.runtime_settings settings
  where settings.singleton;

  return result;
end;
$$;

create or replace function public.admin_update_runtime_settings(
  p_submissions_paused boolean,
  p_read_only boolean,
  p_emergency_lockdown boolean,
  p_public_message text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  previous_settings public.runtime_settings%rowtype;
  clean_message text := nullif(btrim(coalesce(p_public_message, '')), '');
  result jsonb;
begin
  perform public.assert_owner();

  if clean_message is not null and char_length(clean_message) > 160 then
    raise exception 'public message is too long' using errcode = '22001';
  end if;

  select * into previous_settings
  from public.runtime_settings
  where singleton
  for update;

  update public.runtime_settings
  set submissions_paused = coalesce(p_submissions_paused, submissions_paused),
      read_only = coalesce(p_read_only, read_only),
      emergency_lockdown = coalesce(p_emergency_lockdown, emergency_lockdown),
      public_message = clean_message,
      updated_at = now(),
      updated_by = auth.uid()
  where singleton;

  insert into public.moderation_actions
    (actor_id, entity_type, entity_id, action, snapshot)
  values
    (
      auth.uid(),
      'settings',
      '00000000-0000-0000-0000-000000000000'::uuid,
      'update_runtime_settings',
      jsonb_build_object(
        'previous', jsonb_build_object(
          'submissionsPaused', previous_settings.submissions_paused,
          'readOnly', previous_settings.read_only,
          'emergencyLockdown', previous_settings.emergency_lockdown,
          'publicMessage', previous_settings.public_message
        ),
        'next', jsonb_build_object(
          'submissionsPaused', coalesce(p_submissions_paused, previous_settings.submissions_paused),
          'readOnly', coalesce(p_read_only, previous_settings.read_only),
          'emergencyLockdown', coalesce(p_emergency_lockdown, previous_settings.emergency_lockdown),
          'publicMessage', clean_message
        )
      )
    );

  select jsonb_build_object(
    'submissionsPaused', settings.submissions_paused,
    'readOnly', settings.read_only,
    'emergencyLockdown', settings.emergency_lockdown,
    'publicMessage', settings.public_message,
    'updatedAt', settings.updated_at
  ) into result
  from public.runtime_settings settings
  where settings.singleton;

  return result;
end;
$$;

create or replace function public.submit_question(
  p_session_id text,
  p_author_role text,
  p_body text,
  p_anonymous boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  gate_result jsonb;
  rate_result jsonb;
  question_id uuid := gen_random_uuid();
  receipt text;
  clean_body text;
  session_fingerprint text;
  created_at timestamptz;
begin
  gate_result := question_wall_private.submission_gate('question');
  if gate_result is not null then
    return gate_result;
  end if;

  if p_author_role not in ('adult', 'child') then
    raise exception 'invalid author role' using errcode = '22023';
  end if;

  clean_body := question_wall_private.clean_submission_body(p_body, 5, 80);
  session_fingerprint := question_wall_private.session_fingerprint(p_session_id);
  rate_result := question_wall_private.consume_rate_limit('question', p_session_id);

  if not coalesce((rate_result ->> 'allowed')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'error', 'rate_limited',
      'message', '提交太频繁，请稍后再试。',
      'retryAfter', coalesce((rate_result ->> 'retryAfter')::integer, 60)
    );
  end if;

  perform set_config('question_wall.submission_rpc', '1', true);
  insert into public.questions
    (id, author_session_id, author_role, body, anonymous)
  values
    (
      question_id,
      session_fingerprint,
      p_author_role,
      clean_body,
      coalesce(p_anonymous, true)
    )
  returning public.questions.created_at into created_at;

  receipt := question_wall_private.create_receipt('question', question_id);

  insert into public.submission_events
    (receipt_id, event_type, message, payload)
  select
    stored_receipt.id,
    'submitted',
    '问题已提交，正在等待审核。',
    jsonb_build_object('status', 'pending', 'revision', 1)
  from public.submission_receipts stored_receipt
  where stored_receipt.entity_type = 'question'
    and stored_receipt.entity_id = question_id;

  return jsonb_build_object(
    'ok', true,
    'id', question_id,
    'receipt', receipt,
    'status', 'pending',
    'createdAt', created_at
  );
end;
$$;

create or replace function public.submit_answer(
  p_session_id text,
  p_question_id uuid,
  p_author_role text,
  p_body text,
  p_anonymous boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  gate_result jsonb;
  rate_result jsonb;
  current_question public.questions%rowtype;
  answer_id uuid := gen_random_uuid();
  receipt text;
  clean_body text;
  session_fingerprint text;
  created_at timestamptz;
begin
  gate_result := question_wall_private.submission_gate('answer');
  if gate_result is not null then
    return gate_result;
  end if;

  if p_author_role not in ('adult', 'child') then
    raise exception 'invalid author role' using errcode = '22023';
  end if;

  clean_body := question_wall_private.clean_submission_body(p_body, 1, 160);
  session_fingerprint := question_wall_private.session_fingerprint(p_session_id);

  select * into current_question
  from public.questions
  where id = p_question_id
  for update;

  if not found or current_question.status <> 'open' then
    return jsonb_build_object(
      'ok', false,
      'error', 'question_not_open',
      'message', '这个问题目前不能回答。'
    );
  end if;

  if current_question.target_role <> p_author_role then
    raise exception 'answer role does not match question target'
      using errcode = '23514';
  end if;

  if current_question.author_session_id = session_fingerprint then
    return jsonb_build_object(
      'ok', false,
      'error', 'own_question',
      'message', '不能回答自己提出的问题。'
    );
  end if;

  if exists (
    select 1
    from public.answers answer
    where answer.question_id = p_question_id
      and answer.author_session_id = session_fingerprint
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_answered',
      'message', '你已经回答过这个问题。'
    );
  end if;

  rate_result := question_wall_private.consume_rate_limit('answer', p_session_id);
  if not coalesce((rate_result ->> 'allowed')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'error', 'rate_limited',
      'message', '提交太频繁，请稍后再试。',
      'retryAfter', coalesce((rate_result ->> 'retryAfter')::integer, 60)
    );
  end if;

  perform set_config('question_wall.submission_rpc', '1', true);
  insert into public.answers
    (id, question_id, author_session_id, author_role, body, anonymous)
  values
    (
      answer_id,
      p_question_id,
      session_fingerprint,
      p_author_role,
      clean_body,
      coalesce(p_anonymous, true)
    )
  returning public.answers.created_at into created_at;

  receipt := question_wall_private.create_receipt('answer', answer_id);

  insert into public.submission_events
    (receipt_id, event_type, message, payload)
  select
    stored_receipt.id,
    'submitted',
    '回答已提交，正在等待审核。',
    jsonb_build_object('status', 'pending', 'revision', 1)
  from public.submission_receipts stored_receipt
  where stored_receipt.entity_type = 'answer'
    and stored_receipt.entity_id = answer_id;

  return jsonb_build_object(
    'ok', true,
    'id', answer_id,
    'receipt', receipt,
    'status', 'pending',
    'createdAt', created_at
  );
end;
$$;

create or replace function public.submit_report(
  p_session_id text,
  p_note_id uuid,
  p_reason text default 'other'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  gate_result jsonb;
  rate_result jsonb;
  session_fingerprint text;
  report_reason text := lower(btrim(coalesce(p_reason, 'other')));
  report_id uuid;
begin
  gate_result := question_wall_private.submission_gate('report');
  if gate_result is not null then
    return gate_result;
  end if;

  if report_reason not in ('privacy', 'abuse', 'spam', 'other') then
    raise exception 'invalid report reason' using errcode = '22023';
  end if;

  session_fingerprint := question_wall_private.session_fingerprint(p_session_id);

  if exists (
    select 1
    from public.reports report
    where report.target_type = 'note'
      and report.target_id = p_note_id
      and report.reporter_session_id = session_fingerprint
  ) then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'status', 'open'
    );
  end if;

  rate_result := question_wall_private.consume_rate_limit('report', p_session_id);
  if not coalesce((rate_result ->> 'allowed')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'error', 'rate_limited',
      'message', '举报太频繁，请稍后再试。',
      'retryAfter', coalesce((rate_result ->> 'retryAfter')::integer, 60)
    );
  end if;

  perform set_config('question_wall.submission_rpc', '1', true);
  insert into public.reports
    (target_type, target_id, reporter_session_id, reason)
  values
    ('note', p_note_id, session_fingerprint, report_reason)
  returning id into report_id;

  return jsonb_build_object(
    'ok', true,
    'id', report_id,
    'status', 'open'
  );
end;
$$;

create or replace function public.get_submission_status(
  p_receipt text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  receipt public.submission_receipts%rowtype;
  result jsonb;
  events jsonb;
begin
  select * into receipt
  from public.submission_receipts stored_receipt
  where stored_receipt.token_hash = question_wall_private.receipt_hash(p_receipt)
    and stored_receipt.revoked_at is null
    and stored_receipt.expires_at > now();

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.submission_receipts
  set last_accessed_at = now()
  where id = receipt.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', event.id,
        'type', event.event_type,
        'message', event.message,
        'payload', event.payload,
        'createdAt', event.created_at
      ) order by event.id desc
    ),
    '[]'::jsonb
  ) into events
  from (
    select stored_event.*
    from public.submission_events stored_event
    where stored_event.receipt_id = receipt.id
    order by stored_event.id desc
    limit 20
  ) event;

  if receipt.entity_type = 'question' then
    select jsonb_build_object(
      'ok', true,
      'type', 'question',
      'id', question.id,
      'status', question.status,
      'body', question.body,
      'authorRole', question.author_role,
      'targetRole', question.target_role,
      'direction', question.direction,
      'anonymous', question.anonymous,
      'revision', question.submission_revision,
      'rejectionReason', case
        when question.status in ('rejected', 'hidden') then question.submitter_feedback
        else null
      end,
      'createdAt', question.created_at,
      'updatedAt', question.updated_at,
      'events', events
    ) into result
    from public.questions question
    where question.id = receipt.entity_id;
  else
    select jsonb_build_object(
      'ok', true,
      'type', 'answer',
      'id', answer.id,
      'questionId', answer.question_id,
      'questionBody', question.body,
      'direction', question.direction,
      'status', answer.status,
      'body', answer.body,
      'authorRole', answer.author_role,
      'anonymous', answer.anonymous,
      'revision', answer.submission_revision,
      'rejectionReason', case
        when answer.status in ('rejected', 'hidden') then answer.submitter_feedback
        else null
      end,
      'createdAt', answer.created_at,
      'updatedAt', answer.updated_at,
      'events', events
    ) into result
    from public.answers answer
    join public.questions question on question.id = answer.question_id
    where answer.id = receipt.entity_id;
  end if;

  if result is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return result;
end;
$$;

create or replace function public.resubmit_question(
  p_receipt text,
  p_body text,
  p_anonymous boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  gate_result jsonb;
  rate_result jsonb;
  receipt public.submission_receipts%rowtype;
  question public.questions%rowtype;
  clean_body text;
begin
  gate_result := question_wall_private.submission_gate('resubmit');
  if gate_result is not null then
    return gate_result;
  end if;

  select * into receipt
  from public.submission_receipts stored_receipt
  where stored_receipt.token_hash = question_wall_private.receipt_hash(p_receipt)
    and stored_receipt.entity_type = 'question'
    and stored_receipt.revoked_at is null
    and stored_receipt.expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into question
  from public.questions stored_question
  where stored_question.id = receipt.entity_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if question.status <> 'rejected' then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_resubmittable',
      'message', '只有被驳回的内容可以修改后重提。'
    );
  end if;

  clean_body := question_wall_private.clean_submission_body(p_body, 5, 80);
  rate_result := question_wall_private.consume_rate_limit(
    'resubmit',
    lower(btrim(p_receipt))
  );

  if not coalesce((rate_result ->> 'allowed')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'error', 'rate_limited',
      'message', '重新提交太频繁，请稍后再试。',
      'retryAfter', coalesce((rate_result ->> 'retryAfter')::integer, 60)
    );
  end if;

  update public.questions
  set body = clean_body,
      anonymous = coalesce(p_anonymous, question.anonymous),
      status = 'pending',
      moderated_at = null,
      moderated_by = null,
      moderation_reason = null,
      submitter_feedback = null,
      resubmitted_at = now(),
      submission_revision = question.submission_revision + 1
  where id = question.id;

  return jsonb_build_object(
    'ok', true,
    'id', question.id,
    'status', 'pending',
    'revision', question.submission_revision + 1
  );
end;
$$;

create or replace function public.resubmit_answer(
  p_receipt text,
  p_body text,
  p_anonymous boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  gate_result jsonb;
  rate_result jsonb;
  receipt public.submission_receipts%rowtype;
  answer public.answers%rowtype;
  question public.questions%rowtype;
  clean_body text;
begin
  gate_result := question_wall_private.submission_gate('resubmit');
  if gate_result is not null then
    return gate_result;
  end if;

  select * into receipt
  from public.submission_receipts stored_receipt
  where stored_receipt.token_hash = question_wall_private.receipt_hash(p_receipt)
    and stored_receipt.entity_type = 'answer'
    and stored_receipt.revoked_at is null
    and stored_receipt.expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into answer
  from public.answers stored_answer
  where stored_answer.id = receipt.entity_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if answer.status <> 'rejected' then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_resubmittable',
      'message', '只有被驳回的内容可以修改后重提。'
    );
  end if;

  select * into question
  from public.questions stored_question
  where stored_question.id = answer.question_id
  for update;

  if not found or question.status <> 'open' then
    return jsonb_build_object(
      'ok', false,
      'error', 'question_not_open',
      'message', '原问题目前不能继续回答。'
    );
  end if;

  clean_body := question_wall_private.clean_submission_body(p_body, 1, 160);
  rate_result := question_wall_private.consume_rate_limit(
    'resubmit',
    lower(btrim(p_receipt))
  );

  if not coalesce((rate_result ->> 'allowed')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'error', 'rate_limited',
      'message', '重新提交太频繁，请稍后再试。',
      'retryAfter', coalesce((rate_result ->> 'retryAfter')::integer, 60)
    );
  end if;

  update public.answers
  set body = clean_body,
      anonymous = coalesce(p_anonymous, answer.anonymous),
      status = 'pending',
      featured = false,
      moderated_at = null,
      moderated_by = null,
      moderation_reason = null,
      submitter_feedback = null,
      resubmitted_at = now(),
      submission_revision = answer.submission_revision + 1
  where id = answer.id;

  return jsonb_build_object(
    'ok', true,
    'id', answer.id,
    'status', 'pending',
    'revision', answer.submission_revision + 1
  );
end;
$$;

-- Runtime flags are applied in the data projection itself, so a cached client
-- cannot bypass emergency lockdown merely by omitting a status check.
create or replace view public.wall_notes
with (security_barrier = true)
as
select
  answer.id as note_id,
  question.id as question_id,
  answer.id as answer_id,
  question.direction,
  question.body as question,
  answer.body as answer,
  answer.created_at as published_at,
  answer.featured,
  count(*) over (partition by question.id) as answer_count
from public.answers answer
join public.questions question on question.id = answer.question_id
cross join public.runtime_settings settings
where settings.singleton
  and not settings.emergency_lockdown
  and answer.status = 'published'
  and question.status in ('open', 'closed');

create or replace view public.question_pool
with (security_barrier = true)
as
select
  question.id,
  question.direction,
  question.author_role as asker_role,
  question.target_role,
  question.body,
  count(answer.id) filter (where answer.status = 'published') as answer_count,
  question.created_at,
  question.status
from public.questions question
left join public.answers answer on answer.question_id = question.id
cross join public.runtime_settings settings
where settings.singleton
  and not settings.emergency_lockdown
  and not settings.read_only
  and not settings.submissions_paused
  and question.status = 'open'
group by question.id;

revoke execute on function question_wall_private.session_fingerprint(text)
  from public, anon, authenticated;
revoke execute on function question_wall_private.receipt_hash(text)
  from public, anon, authenticated;
revoke execute on function question_wall_private.clean_submission_body(text, integer, integer)
  from public, anon, authenticated;
revoke execute on function question_wall_private.request_network_key()
  from public, anon, authenticated;
revoke execute on function question_wall_private.consume_rate_limit(text, text)
  from public, anon, authenticated;
revoke execute on function question_wall_private.submission_gate(text)
  from public, anon, authenticated;
revoke execute on function question_wall_private.create_receipt(text, uuid)
  from public, anon, authenticated;
revoke all on all functions in schema question_wall_private
  from public, anon, authenticated;

revoke execute on function public.is_owner() from public, anon, authenticated;
revoke execute on function public.assert_owner() from public, anon, authenticated;
revoke execute on function public.validate_experience_question()
  from public, anon, authenticated;
revoke execute on function public.validate_experience_answer()
  from public, anon, authenticated;
revoke execute on function public.validate_experience_report()
  from public, anon, authenticated;

revoke execute on function public.submit_question(text, text, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.submit_answer(text, uuid, text, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.submit_report(text, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.get_submission_status(text)
  from public, anon, authenticated;
revoke execute on function public.resubmit_question(text, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.resubmit_answer(text, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.public_runtime_status()
  from public, anon, authenticated;
revoke execute on function public.admin_get_runtime_settings()
  from public, anon, authenticated;
revoke execute on function public.admin_update_runtime_settings(boolean, boolean, boolean, text)
  from public, anon, authenticated;

grant execute on function public.submit_question(text, text, text, boolean)
  to anon, authenticated;
grant execute on function public.submit_answer(text, uuid, text, text, boolean)
  to anon, authenticated;
grant execute on function public.submit_report(text, uuid, text)
  to anon, authenticated;
grant execute on function public.get_submission_status(text)
  to anon, authenticated;
grant execute on function public.resubmit_question(text, text, boolean)
  to anon, authenticated;
grant execute on function public.resubmit_answer(text, text, boolean)
  to anon, authenticated;
grant execute on function public.public_runtime_status()
  to anon, authenticated;
grant execute on function public.admin_get_runtime_settings()
  to authenticated;
grant execute on function public.admin_update_runtime_settings(boolean, boolean, boolean, text)
  to authenticated;

-- Preserve the existing public moderation-status endpoint with schema v3 data.
revoke execute on function public.moderation_status() from public;
grant execute on function public.moderation_status() to anon, authenticated;

revoke all on public.wall_notes from anon, authenticated;
revoke all on public.question_pool from anon, authenticated;
grant select on public.wall_notes to anon, authenticated;
grant select on public.question_pool to anon, authenticated;

notify pgrst, 'reload schema';

commit;
