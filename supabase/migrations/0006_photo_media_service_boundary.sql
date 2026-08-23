-- Keep public Storage transitions behind the photo-note-media Edge Function.
--
-- v4 intentionally granted ordinary reviewers the generic photo moderation RPC
-- so they could reject and feature notes.  That also made it possible to call
-- hide/clear_media over PostgREST and clear a database reference without first
-- removing the public object.  This migration keeps the ordinary review actions
-- available to authenticated moderators, but makes Storage-coupled actions
-- service-role-only wrappers.  The wrapper receives the already verified Edge
-- caller ID and the underlying audit function records that human actor.

begin;

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
  delegated_actor_text text := nullif(
    current_setting('question_wall.photo_media_actor', true),
    ''
  );
  actor_id uuid;
  next_status text;
  next_featured boolean;
  next_public_path text;
  next_published_at timestamptz;
begin
  if delegated_actor_text is null then
    perform public.assert_moderator();
    actor_id := auth.uid();
    if clean_action in ('approve', 'publish', 'hide', 'clear_media') then
      raise exception 'public media actions must use photo-note-media'
        using errcode = '42501';
    end if;
  else
    actor_id := delegated_actor_text::uuid;
    if not exists (
      select 1
      from public.moderator_accounts account
      where account.user_id = actor_id
        and account.enabled
    ) then
      raise exception 'delegated moderator is not enabled' using errcode = '42501';
    end if;
  end if;

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
      moderated_by = actor_id,
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
      actor_id,
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

create or replace function public.edge_moderate_photo_note(
  p_id uuid,
  p_action text,
  p_reason text,
  p_public_object_path text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'photo media service access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.moderator_accounts account
    where account.user_id = p_actor_id and account.enabled
  ) then
    raise exception 'delegated moderator is not enabled' using errcode = '42501';
  end if;

  perform set_config('question_wall.photo_media_actor', p_actor_id::text, true);
  return public.admin_moderate_photo_note(
    p_id,
    p_action,
    p_reason,
    p_public_object_path
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
set search_path = pg_catalog, public, pg_temp
as $$
declare
  current_report public.reports%rowtype;
  current_answer public.answers%rowtype;
  current_photo public.photo_notes%rowtype;
  next_status text;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  delegated_actor_text text := nullif(
    current_setting('question_wall.photo_media_actor', true),
    ''
  );
  actor_id uuid;
  hidden_public_path text;
begin
  if delegated_actor_text is null then
    perform public.assert_moderator();
    actor_id := auth.uid();
  else
    actor_id := delegated_actor_text::uuid;
    if not exists (
      select 1 from public.moderator_accounts account
      where account.user_id = actor_id and account.enabled
    ) then
      raise exception 'delegated moderator is not enabled' using errcode = '42501';
    end if;
  end if;

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
        set status = 'hidden', featured = false, moderated_at = now(),
            moderated_by = actor_id, moderation_reason = clean_note
        where id = current_answer.id;
        insert into public.moderation_actions
          (actor_id, entity_type, entity_id, action, previous_status, next_status, reason, snapshot)
        values (
          actor_id, 'answer', current_answer.id, 'hide', current_answer.status,
          'hidden', clean_note,
          jsonb_build_object(
            'body', current_answer.body,
            'questionId', current_answer.question_id,
            'anonymous', current_answer.anonymous,
            'featured', current_answer.featured,
            'source', 'report'
          )
        );
      elsif current_report.note_kind = 'photo' then
        if delegated_actor_text is null then
          raise exception 'reported photo media must use photo-note-media'
            using errcode = '42501';
        end if;
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
        set status = 'hidden', featured = false, moderated_at = now(),
            moderated_by = actor_id, moderation_reason = clean_note, updated_at = now()
        where id = current_photo.id;
        insert into public.moderation_actions
          (actor_id, entity_type, entity_id, action, previous_status, next_status, reason, snapshot)
        values (
          actor_id, 'photo_note', current_photo.id, 'hide', current_photo.status,
          'hidden', clean_note,
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
  set status = next_status, resolved_at = now(), resolved_by = actor_id,
      resolution_note = clean_note
  where id = p_id;

  insert into public.moderation_actions
    (actor_id, entity_type, entity_id, action, previous_status, next_status, reason, snapshot)
  values (
    actor_id, 'report', p_id, p_action, current_report.status, next_status,
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
    'photoNoteId', case when current_report.note_kind = 'photo' then current_report.target_id end,
    'hiddenPublicObjectPath', hidden_public_path
  );
end;
$$;

create or replace function public.edge_hide_reported_photo(
  p_id uuid,
  p_note text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'photo media service access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.moderator_accounts account
    where account.user_id = p_actor_id and account.enabled
  ) then
    raise exception 'delegated moderator is not enabled' using errcode = '42501';
  end if;

  perform set_config('question_wall.photo_media_actor', p_actor_id::text, true);
  return public.admin_resolve_report(p_id, 'hide_and_resolve', p_note);
end;
$$;

revoke all on function public.edge_moderate_photo_note(uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.edge_hide_reported_photo(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.edge_moderate_photo_note(uuid, text, text, text, uuid)
  to service_role;
grant execute on function public.edge_hide_reported_photo(uuid, text, uuid)
  to service_role;

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
    'photoUploadMode', 'moderator_only',
    'photoMediaServiceBoundaryVersion', 1
  );
$$;

revoke execute on function public.moderation_status() from public;
grant execute on function public.moderation_status() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
