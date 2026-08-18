create extension if not exists pgcrypto;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  author_session_id text not null check (char_length(author_session_id) between 8 and 128),
  author_role text not null check (author_role in ('adult', 'child')),
  target_role text generated always as (
    case when author_role = 'adult' then 'child' else 'adult' end
  ) stored,
  direction text generated always as (
    case when author_role = 'adult' then 'adult_to_child' else 'child_to_adult' end
  ) stored,
  body text not null check (char_length(btrim(body)) between 5 and 80),
  anonymous boolean not null default true,
  status text not null default 'open' check (status in ('open', 'closed', 'hidden')),
  source text not null default 'user' check (source in ('user', 'official')),
  created_at timestamptz not null default now()
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author_session_id text not null check (char_length(author_session_id) between 8 and 128),
  author_role text not null check (author_role in ('adult', 'child')),
  body text not null check (char_length(btrim(body)) between 1 and 160),
  anonymous boolean not null default true,
  status text not null default 'published' check (status in ('published', 'hidden')),
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_id, author_session_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null default 'note' check (target_type = 'note'),
  target_id uuid not null references public.answers(id) on delete cascade,
  reporter_session_id text not null check (char_length(reporter_session_id) between 8 and 128),
  reason text not null default 'other' check (reason in ('privacy', 'abuse', 'spam', 'other')),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_session_id)
);

create index if not exists questions_public_feed_idx
  on public.questions (status, created_at desc);
create index if not exists answers_public_feed_idx
  on public.answers (status, created_at desc);
create index if not exists answers_question_idx
  on public.answers (question_id, status, created_at desc);
create index if not exists reports_status_idx
  on public.reports (status, created_at desc);

create or replace function public.validate_experience_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.body := btrim(new.body);

  if coalesce(auth.role(), '') = 'anon' then
    new.status := 'open';
    new.source := 'user';
    new.created_at := now();

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
set search_path = public
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
    new.status := 'published';
    new.featured := false;
    new.created_at := now();

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
set search_path = public
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
    new.status := 'open';
    new.created_at := now();

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

drop trigger if exists validate_experience_question_trigger on public.questions;
create trigger validate_experience_question_trigger
before insert on public.questions
for each row execute function public.validate_experience_question();

drop trigger if exists validate_experience_answer_trigger on public.answers;
create trigger validate_experience_answer_trigger
before insert on public.answers
for each row execute function public.validate_experience_answer();

drop trigger if exists validate_experience_report_trigger on public.reports;
create trigger validate_experience_report_trigger
before insert on public.reports
for each row execute function public.validate_experience_report();

alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.reports enable row level security;

drop policy if exists experience_insert_questions on public.questions;
create policy experience_insert_questions
on public.questions
for insert
to anon
with check (
  author_role in ('adult', 'child')
  and status = 'open'
  and source = 'user'
  and created_at between now() - interval '1 minute' and now() + interval '1 minute'
);

drop policy if exists experience_insert_answers on public.answers;
create policy experience_insert_answers
on public.answers
for insert
to anon
with check (
  author_role in ('adult', 'child')
  and status = 'published'
  and featured = false
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
  and created_at between now() - interval '1 minute' and now() + interval '1 minute'
);

create or replace view public.wall_notes
with (security_barrier = true)
as
select
  a.id as note_id,
  q.id as question_id,
  a.id as answer_id,
  q.direction,
  q.body as question,
  a.body as answer,
  a.created_at as published_at,
  a.featured,
  count(*) over (partition by q.id) as answer_count
from public.answers a
join public.questions q on q.id = a.question_id
where a.status = 'published'
  and q.status in ('open', 'closed');

create or replace view public.question_pool
with (security_barrier = true)
as
select
  q.id,
  q.direction,
  q.author_role as asker_role,
  q.target_role,
  q.body,
  count(a.id) filter (where a.status = 'published') as answer_count,
  q.created_at,
  q.status
from public.questions q
left join public.answers a on a.question_id = q.id
where q.status = 'open'
group by q.id;

revoke all on public.questions from anon, authenticated;
revoke all on public.answers from anon, authenticated;
revoke all on public.reports from anon, authenticated;
revoke all on public.wall_notes from anon, authenticated;
revoke all on public.question_pool from anon, authenticated;

grant insert on public.questions to anon;
grant insert on public.answers to anon;
grant insert on public.reports to anon;
grant select on public.wall_notes to anon, authenticated;
grant select on public.question_pool to anon, authenticated;

insert into public.questions
  (id, author_session_id, author_role, body, anonymous, status, source, created_at)
values
  ('00000000-0000-4000-8000-000000000001', 'seed-question-01', 'adult', '如果大人也要上一节课，你最想教他们什么？', true, 'closed', 'official', '2026-08-16T09:00:00+08:00'),
  ('00000000-0000-4000-8000-000000000002', 'seed-question-02', 'child', '你小时候做错事，也会不敢告诉爸爸妈妈吗？', true, 'closed', 'user', '2026-08-15T18:00:00+08:00'),
  ('00000000-0000-4000-8000-000000000003', 'seed-question-03', 'adult', '你希望十年后的世界多一个什么东西？', true, 'closed', 'official', '2026-08-14T11:30:00+08:00'),
  ('00000000-0000-4000-8000-000000000004', 'seed-question-04', 'child', '为什么大人难过的时候总说没事？', true, 'closed', 'user', '2026-08-13T20:00:00+08:00'),
  ('00000000-0000-4000-8000-000000000005', 'seed-question-05', 'adult', '你觉得大人最容易忘记什么？', true, 'closed', 'user', '2026-08-12T11:00:00+08:00'),
  ('00000000-0000-4000-8000-000000000006', 'seed-question-06', 'child', '大人为什么一边说要开心，一边又总是很忙？', true, 'closed', 'official', '2026-08-11T16:00:00+08:00'),
  ('00000000-0000-4000-8000-000000000008', 'seed-question-08', 'child', '大人可以不做自己不喜欢的工作吗？', true, 'closed', 'official', '2026-08-09T13:30:00+08:00'),
  ('00000000-0000-4000-8000-000000000101', 'seed-pool-01', 'adult', '在你看来，怎样才算真正的勇敢？', true, 'open', 'official', '2026-08-16T13:20:00+08:00'),
  ('00000000-0000-4000-8000-000000000102', 'seed-pool-02', 'child', '大人可以不做自己不喜欢的工作吗？', true, 'open', 'official', '2026-08-15T10:40:00+08:00'),
  ('00000000-0000-4000-8000-000000000103', 'seed-pool-03', 'adult', '如果可以重新设计一天的课程表，你会怎么排？', true, 'open', 'user', '2026-08-14T09:10:00+08:00'),
  ('00000000-0000-4000-8000-000000000104', 'seed-pool-04', 'child', '你小时候最舍不得丢掉的一件东西是什么？', true, 'open', 'user', '2026-08-13T17:35:00+08:00'),
  ('00000000-0000-4000-8000-000000000105', 'seed-pool-05', 'adult', '当你不开心时，希望大人怎么陪你？', true, 'open', 'user', '2026-08-12T08:50:00+08:00'),
  ('00000000-0000-4000-8000-000000000106', 'seed-pool-06', 'child', '为什么回到家以后，大家还是总在看手机？', true, 'open', 'user', '2026-08-11T19:25:00+08:00')
on conflict (id) do nothing;

insert into public.answers
  (id, question_id, author_session_id, author_role, body, anonymous, status, featured, created_at)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'seed-answer-01', 'child', '学会好好休息，陪我的时候别一直看手机。', true, 'published', true, '2026-08-16T09:30:00+08:00'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000002', 'seed-answer-02', 'adult', '会。我还藏过一张没考好的试卷，那时也很希望有人先问我害不害怕。', true, 'published', true, '2026-08-15T18:10:00+08:00'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000003', 'seed-answer-03', 'child', '一种不会让小动物害怕的烟花。', true, 'published', true, '2026-08-14T12:00:00+08:00'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000004', 'seed-answer-04', 'adult', '有时是不知道怎么开口。大人也在学习把感受说出来。', true, 'published', true, '2026-08-13T20:20:00+08:00'),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000005', 'seed-answer-05', 'child', '忘记自己以前也是小朋友，也会怕黑和不想起床。', true, 'published', false, '2026-08-12T11:40:00+08:00'),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000006', 'seed-answer-06', 'adult', '因为我们常把责任放在开心前面。谢谢你提醒我，它们不该总是排队。', true, 'published', false, '2026-08-11T16:50:00+08:00'),
  ('00000000-0000-4000-8000-000000000207', '00000000-0000-4000-8000-000000000005', 'seed-answer-07', 'child', '忘记夸奖不用等到我考一百分。', true, 'published', false, '2026-08-10T10:25:00+08:00'),
  ('00000000-0000-4000-8000-000000000208', '00000000-0000-4000-8000-000000000008', 'seed-answer-08', 'adult', '可以，但有时要先准备好下一步。重要的是别把不喜欢误当成只能忍耐。', true, 'published', false, '2026-08-09T14:05:00+08:00')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
