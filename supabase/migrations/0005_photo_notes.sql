-- Schema v4: moderator-captured physical/photo sticky notes.
--
-- Security boundary:
--   * photo-note-staging is private and has no browser-role object policies.
--   * photo-note-public is readable only after a moderator publishes a row.
--   * uploads, private previews and staging-to-public copies are brokered by
--     the authenticated photo-note-media Edge Function.
--   * anon/authenticated roles cannot read photo_notes or write either bucket.
--   * the public wall sees only published rows through wall_notes.

begin;

create table if not exists public.photo_notes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  direction text check (
    direction is null
    or direction in ('adult_to_child', 'child_to_adult')
  ),
  question_text text check (
    question_text is null
    or char_length(btrim(question_text)) between 1 and 160
  ),
  answer_text text check (
    answer_text is null
    or char_length(btrim(answer_text)) between 1 and 320
  ),
  alt_text text check (
    alt_text is null
    or char_length(btrim(alt_text)) between 5 and 500
  ),
  internal_note text check (
    internal_note is null
    or char_length(btrim(internal_note)) between 1 and 1000
  ),
  source text not null default 'staff_capture' check (
    source in ('staff_capture', 'offline_event', 'archive')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'pending', 'published', 'hidden', 'rejected')
  ),
  featured boolean not null default false,
  rotation_degrees smallint not null default 0 check (
    rotation_degrees in (0, 90, 180, 270)
  ),
  staging_object_path text not null unique check (
    char_length(staging_object_path) between 10 and 500
    and staging_object_path !~ '(^|/)\.\.(/|$)'
  ),
  public_object_path text unique check (
    public_object_path is null
    or (
      char_length(public_object_path) between 10 and 500
      and public_object_path !~ '(^|/)\.\.(/|$)'
    )
  ),
  mime_type text check (
    mime_type is null
    or mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  file_size_bytes bigint check (
    file_size_bytes is null
    or file_size_bytes between 1 and 8388608
  ),
  width integer check (width is null or width between 1 and 12000),
  height integer check (height is null or height between 1 and 12000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  published_at timestamptz,
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null,
  moderation_reason text check (
    moderation_reason is null
    or char_length(btrim(moderation_reason)) between 1 and 500
  ),
  constraint photo_notes_rejection_reason_required_check check (
    status <> 'rejected'
    or nullif(btrim(moderation_reason), '') is not null
  ),
  constraint photo_notes_published_fields_required_check check (
    status <> 'published'
    or (
      direction is not null
      and nullif(btrim(question_text), '') is not null
      and nullif(btrim(answer_text), '') is not null
      and nullif(btrim(alt_text), '') is not null
      and nullif(btrim(public_object_path), '') is not null
      and mime_type is not null
      and file_size_bytes is not null
      and published_at is not null
    )
  )
);

create index if not exists photo_notes_moderation_queue_idx
  on public.photo_notes (status, created_at asc);
create index if not exists photo_notes_public_feed_idx
  on public.photo_notes (status, published_at desc)
  where status = 'published';
create index if not exists photo_notes_creator_idx
  on public.photo_notes (created_by, created_at desc);

alter table public.photo_notes enable row level security;
revoke all on public.photo_notes from anon, authenticated;

-- Storage metadata is managed by Supabase Storage. Neither bucket receives an
-- anon/authenticated INSERT/UPDATE/DELETE policy in this migration. The Edge
-- Function uses the service role only after validating the caller through an
-- authenticated moderator RPC.
insert into storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'photo-note-staging',
    'photo-note-staging',
    false,
    8388608,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'photo-note-public',
    'photo-note-public',
    true,
    8388608,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.moderation_actions
  drop constraint if exists moderation_actions_entity_type_check;
alter table public.moderation_actions
  add constraint moderation_actions_entity_type_check
  check (entity_type in ('question', 'answer', 'photo_note', 'report', 'settings'));

-- reports.target_id becomes a validated polymorphic note id. Direct public
-- writes remain revoked, and both the trigger and submit_report verify that the
-- target is currently visible before accepting a report.
alter table public.reports
  drop constraint if exists reports_target_id_fkey;
alter table public.reports
  add column if not exists note_kind text;
update public.reports
set note_kind = 'text'
where note_kind is null;
alter table public.reports
  alter column note_kind set default 'text';
alter table public.reports
  alter column note_kind set not null;
alter table public.reports
  drop constraint if exists reports_note_kind_check;
alter table public.reports
  add constraint reports_note_kind_check
  check (note_kind in ('text', 'photo'));
alter table public.reports
  drop constraint if exists reports_target_type_target_id_reporter_session_id_key;
alter table public.reports
  drop constraint if exists reports_note_identity_reporter_key;
alter table public.reports
  add constraint reports_note_identity_reporter_key
  unique (target_type, note_kind, target_id, reporter_session_id);

create index if not exists reports_note_target_idx
  on public.reports (note_kind, target_id, status, created_at desc);

create or replace function public.admin_create_photo_note(
  p_direction text default null,
  p_question_text text default null,
  p_answer_text text default null,
  p_alt_text text default null,
  p_internal_note text default null,
  p_rotation_degrees integer default 0,
  p_source text default 'staff_capture'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
  note_id uuid := gen_random_uuid();
  clean_direction text := nullif(lower(btrim(coalesce(p_direction, ''))), '');
  clean_question text;
  clean_answer text;
  clean_alt text := nullif(regexp_replace(btrim(coalesce(p_alt_text, '')), '[[:space:]]+', ' ', 'g'), '');
  clean_internal_note text := nullif(regexp_replace(btrim(coalesce(p_internal_note, '')), '[[:space:]]+', ' ', 'g'), '');
  clean_source text := lower(btrim(coalesce(p_source, 'staff_capture')));
  staging_path text;
begin
  perform public.assert_moderator();

  if clean_direction is not null
     and clean_direction not in ('adult_to_child', 'child_to_adult') then
    raise exception 'invalid photo-note direction' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_question_text, '')), '') is not null then
    clean_question := question_wall_private.clean_submission_body(
      p_question_text,
      1,
      160
    );
  end if;

  if nullif(btrim(coalesce(p_answer_text, '')), '') is not null then
    clean_answer := question_wall_private.clean_submission_body(
      p_answer_text,
      1,
      320
    );
  end if;

  if clean_alt is not null and char_length(clean_alt) not between 5 and 500 then
    raise exception 'alt text must be between 5 and 500 characters'
      using errcode = '22001';
  end if;

  if clean_internal_note is not null and char_length(clean_internal_note) > 1000 then
    raise exception 'internal note is too long' using errcode = '22001';
  end if;

  if coalesce(p_rotation_degrees, 0) not in (0, 90, 180, 270) then
    raise exception 'invalid rotation' using errcode = '22023';
  end if;

  if clean_source not in ('staff_capture', 'offline_event', 'archive') then
    raise exception 'invalid photo-note source' using errcode = '22023';
  end if;

  staging_path := auth.uid()::text || '/' || note_id::text || '/source.jpg';

  insert into public.photo_notes (
    id,
    created_by,
    direction,
    question_text,
    answer_text,
    alt_text,
    internal_note,
    source,
    rotation_degrees,
    staging_object_path
  ) values (
    note_id,
    auth.uid(),
    clean_direction,
    clean_question,
    clean_answer,
    clean_alt,
    clean_internal_note,
    clean_source,
    coalesce(p_rotation_degrees, 0),
    staging_path
  );

  insert into public.moderation_actions
    (actor_id, entity_type, entity_id, action, previous_status, next_status, snapshot)
  values
    (
      auth.uid(),
      'photo_note',
      note_id,
      'create_draft',
      null,
      'draft',
      jsonb_build_object(
        'direction', clean_direction,
        'source', clean_source,
        'stagingObjectPath', staging_path
      )
    );

  return jsonb_build_object(
    'id', note_id,
    'status', 'draft',
    'stagingBucket', 'photo-note-staging',
    'stagingObjectPath', staging_path,
    'createdAt', now()
  );
end;
$$;

create or replace function public.admin_get_photo_note(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.assert_moderator();

  select jsonb_build_object(
    'id', note.id,
    'createdBy', note.created_by,
    'direction', note.direction,
    'questionText', note.question_text,
    'answerText', note.answer_text,
    'altText', note.alt_text,
    'internalNote', note.internal_note,
    'source', note.source,
    'status', note.status,
    'featured', note.featured,
    'rotationDegrees', note.rotation_degrees,
    'stagingBucket', 'photo-note-staging',
    'stagingObjectPath', note.staging_object_path,
    'publicBucket', 'photo-note-public',
    'publicObjectPath', note.public_object_path,
    'mimeType', note.mime_type,
    'fileSizeBytes', note.file_size_bytes,
    'width', note.width,
    'height', note.height,
    'createdAt', note.created_at,
    'updatedAt', note.updated_at,
    'submittedAt', note.submitted_at,
    'publishedAt', note.published_at,
    'moderatedAt', note.moderated_at,
    'moderationReason', note.moderation_reason
  )
  into result
  from public.photo_notes note
  where note.id = p_id;

  if result is null then
    raise exception 'photo note not found' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

create or replace function public.admin_update_photo_note(
  p_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  current_note public.photo_notes%rowtype;
  patch jsonb := coalesce(p_patch, '{}'::jsonb);
  next_direction text;
  next_question text;
  next_answer text;
  next_alt text;
  next_internal_note text;
  next_rotation smallint;
  next_mime_type text;
  next_file_size bigint;
  next_width integer;
  next_height integer;
  raw_value text;
begin
  perform public.assert_moderator();

  if jsonb_typeof(patch) <> 'object' then
    raise exception 'photo-note patch must be an object' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(patch) as field(key)
    where field.key not in (
      'direction',
      'questionText',
      'answerText',
      'altText',
      'internalNote',
      'rotationDegrees',
      'mimeType',
      'fileSizeBytes',
      'width',
      'height'
    )
  ) then
    raise exception 'photo-note patch contains unsupported fields'
      using errcode = '22023';
  end if;

  select * into current_note
  from public.photo_notes note
  where note.id = p_id
  for update;

  if not found then
    raise exception 'photo note not found' using errcode = 'P0002';
  end if;

  next_direction := current_note.direction;
  next_question := current_note.question_text;
  next_answer := current_note.answer_text;
  next_alt := current_note.alt_text;
  next_internal_note := current_note.internal_note;
  next_rotation := current_note.rotation_degrees;
  next_mime_type := current_note.mime_type;
  next_file_size := current_note.file_size_bytes;
  next_width := current_note.width;
  next_height := current_note.height;

  if patch ? 'direction' then
    next_direction := nullif(lower(btrim(coalesce(patch ->> 'direction', ''))), '');
    if next_direction is not null
       and next_direction not in ('adult_to_child', 'child_to_adult') then
      raise exception 'invalid photo-note direction' using errcode = '22023';
    end if;
  end if;

  if patch ? 'questionText' then
    raw_value := nullif(btrim(coalesce(patch ->> 'questionText', '')), '');
    next_question := case
      when raw_value is null then null
      else question_wall_private.clean_submission_body(raw_value, 1, 160)
    end;
  end if;

  if patch ? 'answerText' then
    raw_value := nullif(btrim(coalesce(patch ->> 'answerText', '')), '');
    next_answer := case
      when raw_value is null then null
      else question_wall_private.clean_submission_body(raw_value, 1, 320)
    end;
  end if;

  if patch ? 'altText' then
    next_alt := nullif(
      regexp_replace(btrim(coalesce(patch ->> 'altText', '')), '[[:space:]]+', ' ', 'g'),
      ''
    );
    if next_alt is not null and char_length(next_alt) not between 5 and 500 then
      raise exception 'alt text must be between 5 and 500 characters'
        using errcode = '22001';
    end if;
  end if;

  if patch ? 'internalNote' then
    next_internal_note := nullif(
      regexp_replace(btrim(coalesce(patch ->> 'internalNote', '')), '[[:space:]]+', ' ', 'g'),
      ''
    );
    if next_internal_note is not null and char_length(next_internal_note) > 1000 then
      raise exception 'internal note is too long' using errcode = '22001';
    end if;
  end if;

  if patch ? 'rotationDegrees' then
    next_rotation := coalesce((patch ->> 'rotationDegrees')::smallint, 0);
    if next_rotation not in (0, 90, 180, 270) then
      raise exception 'invalid rotation' using errcode = '22023';
    end if;
  end if;

  if patch ? 'mimeType' then
    next_mime_type := nullif(lower(btrim(coalesce(patch ->> 'mimeType', ''))), '');
    if next_mime_type is not null
       and next_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'unsupported image type' using errcode = '22023';
    end if;
  end if;

  if patch ? 'fileSizeBytes' then
    next_file_size := nullif(patch ->> 'fileSizeBytes', '')::bigint;
    if next_file_size is not null and next_file_size not between 1 and 8388608 then
      raise exception 'image is too large' using errcode = '22001';
    end if;
  end if;

  if patch ? 'width' then
    next_width := nullif(patch ->> 'width', '')::integer;
    if next_width is not null and next_width not between 1 and 12000 then
      raise exception 'invalid image width' using errcode = '22023';
    end if;
  end if;

  if patch ? 'height' then
    next_height := nullif(patch ->> 'height', '')::integer;
    if next_height is not null and next_height not between 1 and 12000 then
      raise exception 'invalid image height' using errcode = '22023';
    end if;
  end if;

  if current_note.status in ('published', 'hidden')
     and patch ?| array[
       'rotationDegrees', 'mimeType', 'fileSizeBytes', 'width', 'height'
     ] then
    raise exception 'published media metadata cannot be replaced in place'
      using errcode = '23514';
  end if;

  update public.photo_notes
  set direction = next_direction,
      question_text = next_question,
      answer_text = next_answer,
      alt_text = next_alt,
      internal_note = next_internal_note,
      rotation_degrees = next_rotation,
      mime_type = next_mime_type,
      file_size_bytes = next_file_size,
      width = next_width,
      height = next_height,
      updated_at = now()
  where id = p_id;

  if patch <> '{}'::jsonb then
    insert into public.moderation_actions
      (actor_id, entity_type, entity_id, action, previous_status, next_status, snapshot)
    values
      (
        auth.uid(),
        'photo_note',
        p_id,
        'update_metadata',
        current_note.status,
        current_note.status,
        jsonb_build_object('changedFields', to_jsonb(array(
          select jsonb_object_keys(patch)
        )))
      );
  end if;

  return public.admin_get_photo_note(p_id);
end;
$$;

create or replace function public.admin_submit_photo_note(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
  current_note public.photo_notes%rowtype;
begin
  perform public.assert_moderator();

  select * into current_note
  from public.photo_notes note
  where note.id = p_id
  for update;

  if not found then
    raise exception 'photo note not found' using errcode = 'P0002';
  end if;

  if current_note.status = 'pending' then
    return public.admin_get_photo_note(p_id);
  end if;

  if current_note.status not in ('draft', 'rejected') then
    raise exception 'photo note cannot be submitted from current status'
      using errcode = '23514';
  end if;

  if current_note.direction is null
     or nullif(btrim(current_note.question_text), '') is null
     or nullif(btrim(current_note.answer_text), '') is null
     or nullif(btrim(current_note.alt_text), '') is null then
    raise exception 'direction, transcription and alt text are required'
      using errcode = '23514';
  end if;

  if current_note.mime_type is null or current_note.file_size_bytes is null then
    raise exception 'uploaded image metadata is incomplete' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'photo-note-staging'
      and object.name = current_note.staging_object_path
  ) then
    raise exception 'staged image not found' using errcode = 'P0002';
  end if;

  update public.photo_notes
  set status = 'pending',
      featured = false,
      submitted_at = now(),
      moderated_at = null,
      moderated_by = null,
      moderation_reason = null,
      updated_at = now()
  where id = p_id;

  insert into public.moderation_actions
    (actor_id, entity_type, entity_id, action, previous_status, next_status, snapshot)
  values
    (
      auth.uid(),
      'photo_note',
      p_id,
      'submit',
      current_note.status,
      'pending',
      jsonb_build_object(
        'direction', current_note.direction,
        'mimeType', current_note.mime_type,
        'fileSizeBytes', current_note.file_size_bytes
      )
    );

  return public.admin_get_photo_note(p_id);
end;
$$;

create or replace function public.admin_list_photo_notes(
  p_status text default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.assert_moderator();

  if p_status is not null
     and p_status not in ('draft', 'pending', 'published', 'hidden', 'rejected') then
    raise exception 'invalid photo-note status' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb)
  into result
  from (
    select
      note.id,
      note.created_by as "createdBy",
      note.direction,
      note.question_text as "questionText",
      note.answer_text as "answerText",
      note.alt_text as "altText",
      note.internal_note as "internalNote",
      note.source,
      note.status,
      note.featured,
      note.rotation_degrees as "rotationDegrees",
      'photo-note-staging'::text as "stagingBucket",
      note.staging_object_path as "stagingObjectPath",
      'photo-note-public'::text as "publicBucket",
      note.public_object_path as "publicObjectPath",
      note.mime_type as "mimeType",
      note.file_size_bytes as "fileSizeBytes",
      note.width,
      note.height,
      note.created_at as "createdAt",
      note.updated_at as "updatedAt",
      note.submitted_at as "submittedAt",
      note.published_at as "publishedAt",
      note.moderated_at as "moderatedAt",
      note.moderation_reason as "moderationReason"
    from public.photo_notes note
    where (p_status is null or note.status = p_status)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or coalesce(note.question_text, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(note.answer_text, '') ilike '%' || btrim(p_search) || '%'
        or coalesce(note.internal_note, '') ilike '%' || btrim(p_search) || '%'
      )
    order by
      case note.status when 'pending' then 0 when 'draft' then 1 else 2 end,
      note.created_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
    offset greatest(coalesce(p_offset, 0), 0)
  ) item;

  return result;
end;
$$;

create or replace function public.admin_moderate_photo_note(
  p_id uuid,
  p_action text,
  p_reason text default null,
  p_public_object_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
  current_note public.photo_notes%rowtype;
  clean_action text := lower(btrim(coalesce(p_action, '')));
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  clean_public_path text := nullif(btrim(coalesce(p_public_object_path, '')), '');
  next_status text;
  next_featured boolean;
  next_public_path text;
  next_published_at timestamptz;
begin
  perform public.assert_moderator();

  if clean_reason is not null and char_length(clean_reason) > 500 then
    raise exception 'moderation reason is too long' using errcode = '22001';
  end if;

  select * into current_note
  from public.photo_notes note
  where note.id = p_id
  for update;

  if not found then
    raise exception 'photo note not found' using errcode = 'P0002';
  end if;

  next_status := current_note.status;
  next_featured := current_note.featured;
  next_public_path := current_note.public_object_path;
  next_published_at := current_note.published_at;

  case clean_action
    when 'approve' then
      if current_note.status <> 'pending' then
        raise exception 'photo note cannot be approved from current status'
          using errcode = '23514';
      end if;
      next_status := 'published';
      next_public_path := clean_public_path;
      next_published_at := now();
    when 'reject' then
      if current_note.status <> 'pending' then
        raise exception 'only pending photo notes can be rejected'
          using errcode = '23514';
      end if;
      if clean_reason is null then
        raise exception 'rejection reason is required' using errcode = '23514';
      end if;
      next_status := 'rejected';
      next_featured := false;
    when 'hide' then
      if current_note.status <> 'published' then
        raise exception 'only published photo notes can be hidden'
          using errcode = '23514';
      end if;
      next_status := 'hidden';
      next_featured := false;
    when 'clear_media' then
      if current_note.status <> 'hidden' then
        raise exception 'only hidden photo notes can clear public media'
          using errcode = '23514';
      end if;
      next_public_path := null;
    when 'publish' then
      if current_note.status <> 'hidden' then
        raise exception 'only hidden photo notes can be republished'
          using errcode = '23514';
      end if;
      next_status := 'published';
      next_public_path := coalesce(clean_public_path, current_note.public_object_path);
      next_published_at := now();
    when 'feature' then
      if current_note.status <> 'published' or current_note.featured then
        raise exception 'only unfeatured published photo notes can be featured'
          using errcode = '23514';
      end if;
      next_featured := true;
    when 'unfeature' then
      if not current_note.featured then
        raise exception 'photo note is not featured' using errcode = '23514';
      end if;
      next_featured := false;
    else
      raise exception 'unsupported photo-note moderation action'
        using errcode = '22023';
  end case;

  if next_status = 'published' then
    if current_note.direction is null
       or nullif(btrim(current_note.question_text), '') is null
       or nullif(btrim(current_note.answer_text), '') is null
       or nullif(btrim(current_note.alt_text), '') is null then
      raise exception 'direction, transcription and alt text are required'
        using errcode = '23514';
    end if;

    if next_public_path is null
       or left(next_public_path, char_length(p_id::text) + 1) <> p_id::text || '/'
       or next_public_path ~ '(^|/)\.\.(/|$)' then
      raise exception 'invalid published media path' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'photo-note-public'
        and object.name = next_public_path
    ) then
      raise exception 'published media object not found' using errcode = 'P0002';
    end if;
  end if;

  update public.photo_notes
  set status = next_status,
      featured = next_featured,
      public_object_path = next_public_path,
      published_at = next_published_at,
      moderated_at = now(),
      moderated_by = auth.uid(),
      moderation_reason = case
        when clean_action = 'clear_media' then current_note.moderation_reason
        else clean_reason
      end,
      updated_at = now()
  where id = p_id;

  insert into public.moderation_actions
    (actor_id, entity_type, entity_id, action, previous_status, next_status, reason, snapshot)
  values
    (
      auth.uid(),
      'photo_note',
      p_id,
      clean_action,
      current_note.status,
      next_status,
      clean_reason,
      jsonb_build_object(
        'questionText', current_note.question_text,
        'answerText', current_note.answer_text,
        'direction', current_note.direction,
        'featured', next_featured,
        'publicObjectPath', next_public_path
      )
    );

  return jsonb_build_object(
    'id', p_id,
    'status', next_status,
    'featured', next_featured,
    'publicBucket', 'photo-note-public',
    'publicObjectPath', next_public_path,
    'publishedAt', next_published_at
  );
end;
$$;

create or replace function public.validate_experience_report()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.note_kind = 'text' then
    if not exists (
      select 1
      from public.answers answer
      join public.questions question on question.id = answer.question_id
      cross join public.runtime_settings settings
      where answer.id = new.target_id
        and settings.singleton
        and not settings.emergency_lockdown
        and answer.status = 'published'
        and question.status in ('open', 'closed')
    ) then
      raise exception 'published note not found' using errcode = '23503';
    end if;
  elsif new.note_kind = 'photo' then
    if not exists (
      select 1
      from public.photo_notes note
      cross join public.runtime_settings settings
      where note.id = new.target_id
        and settings.singleton
        and not settings.emergency_lockdown
        and note.status = 'published'
    ) then
      raise exception 'published photo note not found' using errcode = '23503';
    end if;
  else
    raise exception 'unsupported note kind' using errcode = '22023';
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
  resolved_note_kind text;
  existing_status text;
begin
  gate_result := question_wall_private.submission_gate('report');
  if gate_result is not null then
    return gate_result;
  end if;

  if report_reason not in ('privacy', 'abuse', 'spam', 'other') then
    raise exception 'invalid report reason' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.answers answer
    join public.questions question on question.id = answer.question_id
    where answer.id = p_note_id
      and answer.status = 'published'
      and question.status in ('open', 'closed')
  ) then
    resolved_note_kind := 'text';
  elsif exists (
    select 1
    from public.photo_notes note
    where note.id = p_note_id
      and note.status = 'published'
  ) then
    resolved_note_kind := 'photo';
  else
    raise exception 'published note not found' using errcode = '23503';
  end if;

  session_fingerprint := question_wall_private.session_fingerprint(p_session_id);

  select report.status into existing_status
  from public.reports report
  where report.target_type = 'note'
    and report.note_kind = resolved_note_kind
    and report.target_id = p_note_id
    and report.reporter_session_id = session_fingerprint;

  if found then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'status', existing_status
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
    (target_type, note_kind, target_id, reporter_session_id, reason)
  values
    ('note', resolved_note_kind, p_note_id, session_fingerprint, report_reason)
  on conflict (target_type, note_kind, target_id, reporter_session_id) do nothing
  returning id into report_id;

  if report_id is null then
    select report.status into existing_status
    from public.reports report
    where report.target_type = 'note'
      and report.note_kind = resolved_note_kind
      and report.target_id = p_note_id
      and report.reporter_session_id = session_fingerprint;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'status', coalesce(existing_status, 'open')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', report_id,
    'noteKind', resolved_note_kind,
    'status', 'open'
  );
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
set search_path = pg_catalog, public, pg_temp
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
      report.target_id as "noteId",
      report.note_kind as "noteKind",
      case when report.note_kind = 'text' then report.target_id end as "answerId",
      case when report.note_kind = 'photo' then report.target_id end as "photoNoteId",
      report.reason,
      report.status,
      report.created_at as "createdAt",
      report.resolved_at as "resolvedAt",
      report.resolution_note as "resolutionNote",
      case
        when report.note_kind = 'text' then answer.body
        else photo.answer_text
      end as "answerBody",
      case
        when report.note_kind = 'text' then answer.status
        else photo.status
      end as "answerStatus",
      case
        when report.note_kind = 'text' then question.body
        else photo.question_text
      end as "questionBody",
      coalesce(question.direction, photo.direction) as direction,
      photo.alt_text as "altText",
      case when report.note_kind = 'photo' then 'photo-note-staging' end as "stagingBucket",
      photo.staging_object_path as "stagingObjectPath",
      case when report.note_kind = 'photo' then 'photo-note-public' end as "publicBucket",
      photo.public_object_path as "publicObjectPath"
    from public.reports report
    left join public.answers answer
      on report.note_kind = 'text'
     and answer.id = report.target_id
    left join public.questions question on question.id = answer.question_id
    left join public.photo_notes photo
      on report.note_kind = 'photo'
     and photo.id = report.target_id
    where p_status is null or report.status = p_status
    order by report.created_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
    offset greatest(coalesce(p_offset, 0), 0)
  ) item;

  return result;
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
set search_path = pg_catalog, public, pg_temp
as $$
declare
  current_report public.reports%rowtype;
  current_answer public.answers%rowtype;
  current_photo public.photo_notes%rowtype;
  next_status text;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  hidden_public_path text;
begin
  perform public.assert_moderator();

  if clean_note is not null and char_length(clean_note) > 500 then
    raise exception 'resolution note is too long' using errcode = '22001';
  end if;

  select * into current_report
  from public.reports report
  where report.id = p_id
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

      if current_report.note_kind = 'text' then
        select * into current_answer
        from public.answers answer
        where answer.id = current_report.target_id
        for update;

        if not found then
          raise exception 'reported answer not found' using errcode = 'P0002';
        end if;

        if current_answer.status <> 'published' then
          raise exception 'only a published reported answer can be hidden'
            using errcode = '23514';
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
      elsif current_report.note_kind = 'photo' then
        select * into current_photo
        from public.photo_notes photo
        where photo.id = current_report.target_id
        for update;

        if not found then
          raise exception 'reported photo note not found' using errcode = 'P0002';
        end if;

        if current_photo.status <> 'published' then
          raise exception 'only a published reported photo note can be hidden'
            using errcode = '23514';
        end if;

        hidden_public_path := current_photo.public_object_path;

        update public.photo_notes
        set status = 'hidden',
            featured = false,
            moderated_at = now(),
            moderated_by = auth.uid(),
            moderation_reason = clean_note,
            updated_at = now()
        where id = current_photo.id;

        insert into public.moderation_actions
          (actor_id, entity_type, entity_id, action, previous_status, next_status, reason, snapshot)
        values
          (
            auth.uid(),
            'photo_note',
            current_photo.id,
            'hide',
            current_photo.status,
            'hidden',
            clean_note,
            jsonb_build_object(
              'questionText', current_photo.question_text,
              'answerText', current_photo.answer_text,
              'publicObjectPath', current_photo.public_object_path,
              'source', 'report'
            )
          );
      else
        raise exception 'unsupported reported note kind' using errcode = '22023';
      end if;
    else
      raise exception 'unsupported report action' using errcode = '22023';
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
        'noteId', current_report.target_id,
        'noteKind', current_report.note_kind,
        'reason', current_report.reason
      )
    );

  return jsonb_build_object(
    'id', p_id,
    'status', next_status,
    'noteKind', current_report.note_kind,
    'hiddenPublicObjectPath', hidden_public_path
  );
end;
$$;

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform public.assert_moderator();

  return jsonb_build_object(
    'pendingQuestions', (select count(*) from public.questions where status = 'pending'),
    'pendingAnswers', (select count(*) from public.answers where status = 'pending'),
    'pendingPhotoNotes', (select count(*) from public.photo_notes where status = 'pending'),
    'draftPhotoNotes', (select count(*) from public.photo_notes where status = 'draft'),
    'openReports', (select count(*) from public.reports where status = 'open'),
    'publishedNotes', (
      select
        (
          select count(*)
          from public.answers answer
          join public.questions question on question.id = answer.question_id
          where answer.status = 'published'
            and question.status in ('open', 'closed')
        )
        + (select count(*) from public.photo_notes where status = 'published')
    ),
    'publishedPhotoNotes', (
      select count(*) from public.photo_notes where status = 'published'
    ),
    'openQuestions', (select count(*) from public.questions where status = 'open')
  );
end;
$$;

-- Preserve the first nine wall_notes columns for backwards-compatible
-- PostgREST clients; schema-v4 fields are appended.
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
  count(*) over (partition by question.id) as answer_count,
  'text'::text as kind,
  null::uuid as photo_note_id,
  null::text as media_bucket,
  null::text as media_path,
  null::text as alt_text,
  null::integer as media_width,
  null::integer as media_height
from public.answers answer
join public.questions question on question.id = answer.question_id
cross join public.runtime_settings settings
where settings.singleton
  and not settings.emergency_lockdown
  and answer.status = 'published'
  and question.status in ('open', 'closed')
union all
select
  photo.id as note_id,
  null::uuid as question_id,
  null::uuid as answer_id,
  photo.direction,
  photo.question_text as question,
  photo.answer_text as answer,
  photo.published_at,
  photo.featured,
  1::bigint as answer_count,
  'photo'::text as kind,
  photo.id as photo_note_id,
  'photo-note-public'::text as media_bucket,
  photo.public_object_path as media_path,
  photo.alt_text,
  photo.width as media_width,
  photo.height as media_height
from public.photo_notes photo
cross join public.runtime_settings settings
where settings.singleton
  and not settings.emergency_lockdown
  and photo.status = 'published';

create or replace function public.moderation_status()
returns jsonb
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'schemaVersion', 4,
    'hardeningVersion', 1,
    'submissionsRequireReview', true,
    'photoNotesEnabled', true,
    'photoUploadMode', 'moderator_only'
  );
$$;

create or replace function public.public_runtime_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'schemaVersion', 4,
    'hardeningVersion', 1,
    'photoNotesEnabled', true,
    'submissionsPaused', settings.submissions_paused,
    'readOnly', settings.read_only,
    'emergencyLockdown', settings.emergency_lockdown,
    'publicMessage', settings.public_message
  )
  from public.runtime_settings settings
  where settings.singleton;
$$;

revoke execute on function public.admin_create_photo_note(
  text, text, text, text, text, integer, text
) from public, anon;
revoke execute on function public.admin_get_photo_note(uuid) from public, anon;
revoke execute on function public.admin_update_photo_note(uuid, jsonb) from public, anon;
revoke execute on function public.admin_submit_photo_note(uuid) from public, anon;
revoke execute on function public.admin_list_photo_notes(
  text, text, integer, integer
) from public, anon;
revoke execute on function public.admin_moderate_photo_note(
  uuid, text, text, text
) from public, anon;

grant execute on function public.admin_create_photo_note(
  text, text, text, text, text, integer, text
) to authenticated;
grant execute on function public.admin_get_photo_note(uuid) to authenticated;
grant execute on function public.admin_update_photo_note(uuid, jsonb) to authenticated;
grant execute on function public.admin_submit_photo_note(uuid) to authenticated;
grant execute on function public.admin_list_photo_notes(
  text, text, integer, integer
) to authenticated;
grant execute on function public.admin_moderate_photo_note(
  uuid, text, text, text
) to authenticated;

revoke execute on function public.validate_experience_report()
  from public, anon, authenticated;
revoke execute on function public.submit_report(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.submit_report(text, uuid, text)
  to anon, authenticated;

revoke execute on function public.moderation_status() from public;
grant execute on function public.moderation_status() to anon, authenticated;
revoke execute on function public.public_runtime_status()
  from public, anon, authenticated;
grant execute on function public.public_runtime_status()
  to anon, authenticated;

revoke all on public.wall_notes from anon, authenticated;
grant select on public.wall_notes to anon, authenticated;

notify pgrst, 'reload schema';

commit;
