begin;

alter table public.questions
  drop constraint if exists questions_status_check;
alter table public.questions
  alter column status set default 'pending';
alter table public.questions
  add constraint questions_status_check
  check (status in ('pending', 'open', 'closed', 'hidden', 'rejected'));
alter table public.questions
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists moderation_reason text
    check (moderation_reason is null or char_length(moderation_reason) <= 500);

alter table public.answers
  drop constraint if exists answers_status_check;
alter table public.answers
  alter column status set default 'pending';
alter table public.answers
  add constraint answers_status_check
  check (status in ('pending', 'published', 'hidden', 'rejected'));
alter table public.answers
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists moderation_reason text
    check (moderation_reason is null or char_length(moderation_reason) <= 500);

-- Experience-mode submissions were published without review. Keep bundled seed
-- content public, but quarantine every other pre-migration submission.
update public.questions
set status = 'pending',
    moderated_at = null,
    moderated_by = null,
    moderation_reason = null
where source = 'user'
  and author_session_id not like 'seed-%';

update public.answers
set status = 'pending',
    featured = false,
    moderated_at = null,
    moderated_by = null,
    moderation_reason = null
where author_session_id not like 'seed-%';

alter table public.reports
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists resolution_note text
    check (resolution_note is null or char_length(resolution_note) <= 500);

create table if not exists public.moderator_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'reviewer' check (role in ('owner', 'reviewer')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  entity_type text not null check (entity_type in ('question', 'answer', 'report')),
  entity_id uuid not null,
  action text not null,
  previous_status text,
  next_status text,
  reason text check (reason is null or char_length(reason) <= 500),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists questions_moderation_queue_idx
  on public.questions (status, created_at asc);
create index if not exists answers_moderation_queue_idx
  on public.answers (status, created_at asc);
create index if not exists moderation_actions_created_idx
  on public.moderation_actions (created_at desc);

alter table public.moderator_accounts enable row level security;
alter table public.moderation_actions enable row level security;

revoke all on public.moderator_accounts from anon, authenticated;
revoke all on public.moderation_actions from anon, authenticated;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.moderator_accounts account
    where account.user_id = (select auth.uid())
      and account.enabled
  );
$$;

create or replace function public.assert_moderator()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_moderator() then
    raise exception 'moderator access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.validate_experience_question()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.body := btrim(new.body);

  if coalesce(auth.role(), '') = 'anon' then
    new.status := 'pending';
    new.source := 'user';
    new.created_at := now();
    new.moderated_at := null;
    new.moderated_by := null;
    new.moderation_reason := null;

    if (
      select count(*)
      from public.questions
      where author_session_id = new.author_session_id
        and created_at > now() - interval '10 minutes'
    ) >= 5 then
      raise exception 'question rate limit exceeded' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_experience_answer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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

  if coalesce(auth.role(), '') = 'anon' and question_status <> 'open' then
    raise exception 'question is not open' using errcode = '23514';
  end if;

  if expected_role <> new.author_role then
    raise exception 'answer role does not match question target' using errcode = '23514';
  end if;

  if question_session_id = new.author_session_id then
    raise exception 'cannot answer your own question' using errcode = '23514';
  end if;

  if coalesce(auth.role(), '') = 'anon' then
    new.status := 'pending';
    new.featured := false;
    new.created_at := now();
    new.moderated_at := null;
    new.moderated_by := null;
    new.moderation_reason := null;

    if (
      select count(*)
      from public.answers
      where author_session_id = new.author_session_id
        and created_at > now() - interval '10 minutes'
    ) >= 10 then
      raise exception 'answer rate limit exceeded' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_experience_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.answers
    where id = new.target_id
      and status = 'published'
  ) then
    raise exception 'published note not found' using errcode = '23503';
  end if;

  if coalesce(auth.role(), '') = 'anon' then
    new.target_type := 'note';
    new.status := 'open';
    new.created_at := now();
    new.resolved_at := null;
    new.resolved_by := null;
    new.resolution_note := null;

    if (
      select count(*)
      from public.reports
      where reporter_session_id = new.reporter_session_id
        and created_at > now() - interval '1 day'
    ) >= 20 then
      raise exception 'report rate limit exceeded' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop policy if exists experience_insert_questions on public.questions;
create policy experience_insert_questions
on public.questions
for insert
to anon
with check (
  author_role in ('adult', 'child')
  and status = 'pending'
  and source = 'user'
  and moderated_at is null
  and moderated_by is null
  and created_at between now() - interval '1 minute' and now() + interval '1 minute'
);

drop policy if exists experience_insert_answers on public.answers;
create policy experience_insert_answers
on public.answers
for insert
to anon
with check (
  author_role in ('adult', 'child')
  and status = 'pending'
  and featured = false
  and moderated_at is null
  and moderated_by is null
  and created_at between now() - interval '1 minute' and now() + interval '1 minute'
);

drop policy if exists experience_insert_reports on public.reports;
create policy experience_insert_reports
on public.reports
for insert
to anon
with check (
  target_type = 'note'
  and status = 'open'
  and resolved_at is null
  and resolved_by is null
  and resolution_note is null
  and created_at between now() - interval '1 minute' and now() + interval '1 minute'
);

create or replace function public.admin_whoami()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.assert_moderator();

  select jsonb_build_object(
    'userId', account.user_id,
    'email', coalesce(auth.jwt() ->> 'email', ''),
    'role', account.role
  )
  into result
  from public.moderator_accounts account
  where account.user_id = auth.uid()
    and account.enabled;

  return result;
end;
$$;

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_moderator();

  return jsonb_build_object(
    'pendingQuestions', (select count(*) from public.questions where status = 'pending'),
    'pendingAnswers', (select count(*) from public.answers where status = 'pending'),
    'openReports', (select count(*) from public.reports where status = 'open'),
    'publishedNotes', (
      select count(*)
      from public.answers answer
      join public.questions question on question.id = answer.question_id
      where answer.status = 'published'
        and question.status in ('open', 'closed')
    ),
    'openQuestions', (select count(*) from public.questions where status = 'open')
  );
end;
$$;

create or replace function public.moderation_status()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'schemaVersion', 2,
    'submissionsRequireReview', true
  );
$$;

create or replace function public.admin_list_questions(
  p_status text default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.assert_moderator();

  select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb)
  into result
  from (
    select
      question.id,
      question.body,
      question.author_role as "authorRole",
      question.target_role as "targetRole",
      question.direction,
      question.anonymous,
      question.status,
      question.source,
      question.created_at as "createdAt",
      question.moderated_at as "moderatedAt",
      question.moderation_reason as "moderationReason",
      count(answer.id) filter (where answer.status = 'published') as "answerCount"
    from public.questions question
    left join public.answers answer on answer.question_id = question.id
    where (p_status is null or question.status = p_status)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or question.body ilike '%' || btrim(p_search) || '%'
      )
    group by question.id
    order by question.created_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
    offset greatest(coalesce(p_offset, 0), 0)
  ) item;

  return result;
end;
$$;

create or replace function public.admin_list_answers(
  p_status text default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.assert_moderator();

  select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb)
  into result
  from (
    select
      answer.id,
      answer.question_id as "questionId",
      question.body as "questionBody",
      question.direction,
      answer.body,
      answer.author_role as "authorRole",
      answer.anonymous,
      answer.status,
      answer.featured,
      answer.created_at as "createdAt",
      answer.moderated_at as "moderatedAt",
      answer.moderation_reason as "moderationReason"
    from public.answers answer
    join public.questions question on question.id = answer.question_id
    where (p_status is null or answer.status = p_status)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or answer.body ilike '%' || btrim(p_search) || '%'
        or question.body ilike '%' || btrim(p_search) || '%'
      )
    order by answer.created_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
    offset greatest(coalesce(p_offset, 0), 0)
  ) item;

  return result;
end;
$$;

create or replace function public.admin_list_reports(
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.assert_moderator();

  select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb)
  into result
  from (
    select
      report.id,
      report.target_id as "answerId",
      report.reason,
      report.status,
      report.created_at as "createdAt",
      report.resolved_at as "resolvedAt",
      report.resolution_note as "resolutionNote",
      answer.body as "answerBody",
      answer.status as "answerStatus",
      question.body as "questionBody",
      question.direction
    from public.reports report
    join public.answers answer on answer.id = report.target_id
    join public.questions question on question.id = answer.question_id
    where p_status is null or report.status = p_status
    order by report.created_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
    offset greatest(coalesce(p_offset, 0), 0)
  ) item;

  return result;
end;
$$;

create or replace function public.admin_list_actions(
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.assert_moderator();

  select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb)
  into result
  from (
    select
      action.id,
      action.actor_id as "actorId",
      action.entity_type as "entityType",
      action.entity_id as "entityId",
      action.action,
      action.previous_status as "previousStatus",
      action.next_status as "nextStatus",
      action.reason,
      action.snapshot,
      action.created_at as "createdAt"
    from public.moderation_actions action
    order by action.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
    offset greatest(coalesce(p_offset, 0), 0)
  ) item;

  return result;
end;
$$;

create or replace function public.admin_moderate_question(
  p_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_question public.questions%rowtype;
  next_status text;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_moderator();

  if clean_reason is not null and char_length(clean_reason) > 500 then
    raise exception 'moderation reason is too long' using errcode = '22001';
  end if;

  select * into current_question
  from public.questions
  where id = p_id
  for update;

  if not found then
    raise exception 'question not found' using errcode = 'P0002';
  end if;

  case p_action
    when 'approve' then
      if current_question.status <> 'pending' then
        raise exception 'question cannot be approved from current status' using errcode = '23514';
      end if;
      next_status := 'open';
    when 'reject' then
      if current_question.status <> 'pending' then
        raise exception 'only pending questions can be rejected' using errcode = '23514';
      end if;
      next_status := 'rejected';
    when 'hide' then
      if current_question.status not in ('open', 'closed') then
        raise exception 'only public questions can be hidden' using errcode = '23514';
      end if;
      next_status := 'hidden';
    when 'close' then
      if current_question.status <> 'open' then
        raise exception 'only open questions can be closed' using errcode = '23514';
      end if;
      next_status := 'closed';
    when 'reopen' then
      if current_question.status not in ('closed', 'hidden', 'rejected') then
        raise exception 'question cannot be reopened from current status' using errcode = '23514';
      end if;
      next_status := 'open';
    else
      raise exception 'unsupported question moderation action' using errcode = '22023';
  end case;

  update public.questions
  set status = next_status,
      moderated_at = now(),
      moderated_by = auth.uid(),
      moderation_reason = clean_reason
  where id = p_id;

  insert into public.moderation_actions
    (actor_id, entity_type, entity_id, action, previous_status, next_status, reason, snapshot)
  values
    (
      auth.uid(),
      'question',
      p_id,
      p_action,
      current_question.status,
      next_status,
      clean_reason,
      jsonb_build_object(
        'body', current_question.body,
        'direction', current_question.direction,
        'anonymous', current_question.anonymous
      )
    );

  return jsonb_build_object('id', p_id, 'status', next_status);
end;
$$;

create or replace function public.admin_moderate_answer(
  p_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_answer public.answers%rowtype;
  next_status text;
  next_featured boolean;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_moderator();

  if clean_reason is not null and char_length(clean_reason) > 500 then
    raise exception 'moderation reason is too long' using errcode = '22001';
  end if;

  select * into current_answer
  from public.answers
  where id = p_id
  for update;

  if not found then
    raise exception 'answer not found' using errcode = 'P0002';
  end if;

  next_status := current_answer.status;
  next_featured := current_answer.featured;

  case p_action
    when 'approve' then
      if current_answer.status <> 'pending' then
        raise exception 'answer cannot be approved from current status' using errcode = '23514';
      end if;
      next_status := 'published';
    when 'reject' then
      if current_answer.status <> 'pending' then
        raise exception 'only pending answers can be rejected' using errcode = '23514';
      end if;
      next_status := 'rejected';
      next_featured := false;
    when 'hide' then
      if current_answer.status <> 'published' then
        raise exception 'only published answers can be hidden' using errcode = '23514';
      end if;
      next_status := 'hidden';
      next_featured := false;
    when 'publish' then
      if current_answer.status not in ('hidden', 'rejected') then
        raise exception 'answer cannot be published from current status' using errcode = '23514';
      end if;
      next_status := 'published';
    when 'feature' then
      if current_answer.status <> 'published' or current_answer.featured then
        raise exception 'only unfeatured published answers can be featured' using errcode = '23514';
      end if;
      next_featured := true;
    when 'unfeature' then
      if not current_answer.featured then
        raise exception 'answer is not featured' using errcode = '23514';
      end if;
      next_featured := false;
    else
      raise exception 'unsupported answer moderation action' using errcode = '22023';
  end case;

  update public.answers
  set status = next_status,
      featured = next_featured,
      moderated_at = now(),
      moderated_by = auth.uid(),
      moderation_reason = clean_reason
  where id = p_id;

  insert into public.moderation_actions
    (actor_id, entity_type, entity_id, action, previous_status, next_status, reason, snapshot)
  values
    (
      auth.uid(),
      'answer',
      p_id,
      p_action,
      current_answer.status,
      next_status,
      clean_reason,
      jsonb_build_object(
        'body', current_answer.body,
        'questionId', current_answer.question_id,
        'anonymous', current_answer.anonymous,
        'featured', next_featured
      )
    );

  return jsonb_build_object(
    'id', p_id,
    'status', next_status,
    'featured', next_featured
  );
end;
$$;

create or replace function public.admin_resolve_report(
  p_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_report public.reports%rowtype;
  current_answer public.answers%rowtype;
  next_status text;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.assert_moderator();

  if clean_note is not null and char_length(clean_note) > 500 then
    raise exception 'resolution note is too long' using errcode = '22001';
  end if;

  select * into current_report
  from public.reports
  where id = p_id
  for update;

  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;

  if current_report.status <> 'open' then
    raise exception 'report has already been handled' using errcode = '23514';
  end if;

  case p_action
    when 'resolve' then next_status := 'resolved';
    when 'dismiss' then next_status := 'dismissed';
    when 'hide_and_resolve' then
      next_status := 'resolved';

      select * into current_answer
      from public.answers
      where id = current_report.target_id
      for update;

      if not found then
        raise exception 'reported answer not found' using errcode = 'P0002';
      end if;

      if current_answer.status <> 'published' then
        raise exception 'only a published reported answer can be hidden' using errcode = '23514';
      end if;

      update public.answers
      set status = 'hidden',
          featured = false,
          moderated_at = now(),
          moderated_by = auth.uid(),
          moderation_reason = clean_note
      where id = current_answer.id;

      insert into public.moderation_actions
        (actor_id, entity_type, entity_id, action, previous_status, next_status, reason, snapshot)
      values
        (
          auth.uid(),
          'answer',
          current_answer.id,
          'hide',
          current_answer.status,
          'hidden',
          clean_note,
          jsonb_build_object(
            'body', current_answer.body,
            'questionId', current_answer.question_id,
            'anonymous', current_answer.anonymous,
            'featured', current_answer.featured,
            'source', 'report'
          )
        );
    else raise exception 'unsupported report action' using errcode = '22023';
  end case;

  update public.reports
  set status = next_status,
      resolved_at = now(),
      resolved_by = auth.uid(),
      resolution_note = clean_note
  where id = p_id;

  insert into public.moderation_actions
    (actor_id, entity_type, entity_id, action, previous_status, next_status, reason, snapshot)
  values
    (
      auth.uid(),
      'report',
      p_id,
      p_action,
      current_report.status,
      next_status,
      clean_note,
      jsonb_build_object(
        'answerId', current_report.target_id,
        'reason', current_report.reason
      )
    );

  return jsonb_build_object('id', p_id, 'status', next_status);
end;
$$;

revoke execute on function public.is_moderator() from public, anon, authenticated;
revoke execute on function public.assert_moderator() from public, anon, authenticated;
revoke execute on function public.moderation_status() from public;

revoke execute on function public.admin_whoami() from public, anon;
revoke execute on function public.admin_dashboard() from public, anon;
revoke execute on function public.admin_list_questions(text, text, integer, integer) from public, anon;
revoke execute on function public.admin_list_answers(text, text, integer, integer) from public, anon;
revoke execute on function public.admin_list_reports(text, integer, integer) from public, anon;
revoke execute on function public.admin_list_actions(integer, integer) from public, anon;
revoke execute on function public.admin_moderate_question(uuid, text, text) from public, anon;
revoke execute on function public.admin_moderate_answer(uuid, text, text) from public, anon;
revoke execute on function public.admin_resolve_report(uuid, text, text) from public, anon;

grant execute on function public.admin_whoami() to authenticated;
grant execute on function public.moderation_status() to anon, authenticated;
grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.admin_list_questions(text, text, integer, integer) to authenticated;
grant execute on function public.admin_list_answers(text, text, integer, integer) to authenticated;
grant execute on function public.admin_list_reports(text, integer, integer) to authenticated;
grant execute on function public.admin_list_actions(integer, integer) to authenticated;
grant execute on function public.admin_moderate_question(uuid, text, text) to authenticated;
grant execute on function public.admin_moderate_answer(uuid, text, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
