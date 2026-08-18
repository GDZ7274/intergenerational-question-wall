-- Release hardening after schema v3.
--
-- 1. Normalize pre-v3 anonymous session identifiers to the same one-way
--    fingerprint used by the controlled submission RPCs.
-- 2. Require a concrete reason whenever content is rejected.
-- 3. Allow the full 500-character moderation reason in receipt events.
-- 4. Keep strict per-session limits while giving shared networks a higher
--    aggregate ceiling for homes, schools, and event venues.
-- 5. Expose a hardening marker so deployment can verify this migration ran.

begin;

update public.questions
set author_session_id = encode(
  sha256(convert_to(
    'question-wall/session/v1:' || btrim(author_session_id),
    'UTF8'
  )),
  'hex'
)
where author_session_id !~ '^[0-9a-f]{64}$';

with candidates as (
  select
    answer.id,
    answer.question_id,
    encode(
      sha256(convert_to(
        'question-wall/session/v1:' || btrim(answer.author_session_id),
        'UTF8'
      )),
      'hex'
    ) as desired_hash
  from public.answers answer
  where answer.author_session_id !~ '^[0-9a-f]{64}$'
),
ranked as (
  select
    candidate.*,
    row_number() over (
      partition by candidate.question_id, candidate.desired_hash
      order by candidate.id
    ) as desired_rank,
    exists (
      select 1
      from public.answers existing
      where existing.question_id = candidate.question_id
        and existing.author_session_id = candidate.desired_hash
    ) as desired_exists
  from candidates candidate
),
planned as (
  select
    ranked.id,
    case
      when not ranked.desired_exists and ranked.desired_rank = 1
        then ranked.desired_hash
      else encode(
        sha256(convert_to(
          'question-wall/session/v1/legacy-conflict:answer:' ||
          ranked.id::text || ':' || ranked.desired_hash,
          'UTF8'
        )),
        'hex'
      )
    end as next_session_id
  from ranked
)
update public.answers answer
set author_session_id = planned.next_session_id
from planned
where answer.id = planned.id;

with candidates as (
  select
    report.id,
    report.target_type,
    report.target_id,
    encode(
      sha256(convert_to(
        'question-wall/session/v1:' || btrim(report.reporter_session_id),
        'UTF8'
      )),
      'hex'
    ) as desired_hash
  from public.reports report
  where report.reporter_session_id !~ '^[0-9a-f]{64}$'
),
ranked as (
  select
    candidate.*,
    row_number() over (
      partition by
        candidate.target_type,
        candidate.target_id,
        candidate.desired_hash
      order by candidate.id
    ) as desired_rank,
    exists (
      select 1
      from public.reports existing
      where existing.target_type = candidate.target_type
        and existing.target_id = candidate.target_id
        and existing.reporter_session_id = candidate.desired_hash
    ) as desired_exists
  from candidates candidate
),
planned as (
  select
    ranked.id,
    case
      when not ranked.desired_exists and ranked.desired_rank = 1
        then ranked.desired_hash
      else encode(
        sha256(convert_to(
          'question-wall/session/v1/legacy-conflict:report:' ||
          ranked.id::text || ':' || ranked.desired_hash,
          'UTF8'
        )),
        'hex'
      )
    end as next_session_id
  from ranked
)
update public.reports report
set reporter_session_id = planned.next_session_id
from planned
where report.id = planned.id;

update public.questions
set moderation_reason = coalesce(
  nullif(btrim(moderation_reason), ''),
  nullif(btrim(submitter_feedback), ''),
  '内容暂未通过，请修改后重新提交。'
)
where status = 'rejected'
  and nullif(btrim(moderation_reason), '') is null;

update public.answers
set moderation_reason = coalesce(
  nullif(btrim(moderation_reason), ''),
  nullif(btrim(submitter_feedback), ''),
  '内容暂未通过，请修改后重新提交。'
)
where status = 'rejected'
  and nullif(btrim(moderation_reason), '') is null;

alter table public.questions
  drop constraint if exists questions_rejection_reason_required_check;
alter table public.questions
  add constraint questions_rejection_reason_required_check
  check (
    status <> 'rejected'
    or nullif(btrim(moderation_reason), '') is not null
  );

alter table public.answers
  drop constraint if exists answers_rejection_reason_required_check;
alter table public.answers
  add constraint answers_rejection_reason_required_check
  check (
    status <> 'rejected'
    or nullif(btrim(moderation_reason), '') is not null
  );

alter table public.submission_events
  drop constraint if exists submission_events_message_check;
alter table public.submission_events
  add constraint submission_events_message_check
  check (char_length(message) between 1 and 500);

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
  current_limit_count integer;
  window_seconds integer;
  block_seconds integer;
  network_multiplier integer := 20;
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

    current_limit_count := case
      when network_key is not null and current_key = network_key
        then limit_count * network_multiplier
      else limit_count
    end;

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
    elsif current_bucket.request_count >= current_limit_count then
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

revoke execute on function question_wall_private.consume_rate_limit(text, text)
  from public, anon, authenticated;

create or replace function public.public_runtime_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'schemaVersion', 3,
    'hardeningVersion', 1,
    'submissionsPaused', settings.submissions_paused,
    'readOnly', settings.read_only,
    'emergencyLockdown', settings.emergency_lockdown,
    'publicMessage', settings.public_message
  )
  from public.runtime_settings settings
  where settings.singleton;
$$;

notify pgrst, 'reload schema';

commit;
