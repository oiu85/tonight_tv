begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(43);

create function pg_temp.sqlstate_of(command text)
returns text
language plpgsql
as $$
begin
  execute command;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

select is(
  (
    select count(*)
    from pg_proc
    where oid in (
      'public.room_play(uuid,bigint)'::regprocedure,
      'public.room_pause(uuid,bigint)'::regprocedure,
      'public.room_seek(uuid,bigint,double precision)'::regprocedure,
      'public.room_restart(uuid,bigint)'::regprocedure,
      'public.room_select_media(uuid,bigint,uuid,boolean)'::regprocedure,
      'public.room_mark_ended(uuid,bigint)'::regprocedure,
      'public.room_play_next(uuid,bigint)'::regprocedure
    )
  ),
  7::bigint,
  'all seven canonical playback RPCs exist'
);

select is(
  (
    select array_agg(pg_get_function_identity_arguments(oid) order by proname)
    from pg_proc
    where oid in (
      'public.room_play(uuid,bigint)'::regprocedure,
      'public.room_pause(uuid,bigint)'::regprocedure,
      'public.room_seek(uuid,bigint,double precision)'::regprocedure,
      'public.room_restart(uuid,bigint)'::regprocedure,
      'public.room_select_media(uuid,bigint,uuid,boolean)'::regprocedure,
      'public.room_mark_ended(uuid,bigint)'::regprocedure,
      'public.room_play_next(uuid,bigint)'::regprocedure
    )
  ),
  array[
    'p_room_id uuid, p_expected_version bigint',
    'p_room_id uuid, p_expected_version bigint',
    'p_room_id uuid, p_expected_version bigint',
    'p_room_id uuid, p_expected_version bigint',
    'p_room_id uuid, p_expected_version bigint',
    'p_room_id uuid, p_expected_version bigint, p_target_position_sec double precision',
    'p_room_id uuid, p_expected_version bigint, p_media_id uuid, p_autoplay boolean'
  ],
  'RPC signatures never accept caller identity or browser timestamps'
);

select is(
  (
    select count(*)
    from pg_proc
    where oid in (
      'public.room_play(uuid,bigint)'::regprocedure,
      'public.room_pause(uuid,bigint)'::regprocedure,
      'public.room_seek(uuid,bigint,double precision)'::regprocedure,
      'public.room_restart(uuid,bigint)'::regprocedure,
      'public.room_select_media(uuid,bigint,uuid,boolean)'::regprocedure,
      'public.room_mark_ended(uuid,bigint)'::regprocedure,
      'public.room_play_next(uuid,bigint)'::regprocedure
    )
      and prosecdef
  ),
  7::bigint,
  'playback RPCs cross table privileges only through SECURITY DEFINER'
);

select is(
  (
    select count(*)
    from pg_proc
    where oid in (
      'private.lock_owned_playback_state(uuid,bigint)'::regprocedure,
      'public.room_play(uuid,bigint)'::regprocedure,
      'public.room_pause(uuid,bigint)'::regprocedure,
      'public.room_seek(uuid,bigint,double precision)'::regprocedure,
      'public.room_restart(uuid,bigint)'::regprocedure,
      'public.room_select_media(uuid,bigint,uuid,boolean)'::regprocedure,
      'public.room_mark_ended(uuid,bigint)'::regprocedure,
      'public.room_play_next(uuid,bigint)'::regprocedure
    )
      and proconfig = array['search_path=""']::text[]
  ),
  8::bigint,
  'all new functions use an empty search_path'
);

select is(
  (
    select count(*)
    from pg_proc
    where oid in (
      'public.room_play(uuid,bigint)'::regprocedure,
      'public.room_pause(uuid,bigint)'::regprocedure,
      'public.room_seek(uuid,bigint,double precision)'::regprocedure,
      'public.room_restart(uuid,bigint)'::regprocedure,
      'public.room_select_media(uuid,bigint,uuid,boolean)'::regprocedure,
      'public.room_mark_ended(uuid,bigint)'::regprocedure,
      'public.room_play_next(uuid,bigint)'::regprocedure
    )
      and has_function_privilege('authenticated', oid, 'EXECUTE')
  ),
  7::bigint,
  'authenticated callers can reach the owner-checked RPC boundary'
);

select is(
  (
    select count(*)
    from pg_proc
    where oid in (
      'public.room_play(uuid,bigint)'::regprocedure,
      'public.room_pause(uuid,bigint)'::regprocedure,
      'public.room_seek(uuid,bigint,double precision)'::regprocedure,
      'public.room_restart(uuid,bigint)'::regprocedure,
      'public.room_select_media(uuid,bigint,uuid,boolean)'::regprocedure,
      'public.room_mark_ended(uuid,bigint)'::regprocedure,
      'public.room_play_next(uuid,bigint)'::regprocedure
    )
      and has_function_privilege('anon', oid, 'EXECUTE')
  ),
  0::bigint,
  'unauthenticated requests cannot execute playback commands'
);

select is(
  (
    select count(*)
    from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid in (
      'public.room_play(uuid,bigint)'::regprocedure,
      'public.room_pause(uuid,bigint)'::regprocedure,
      'public.room_seek(uuid,bigint,double precision)'::regprocedure,
      'public.room_restart(uuid,bigint)'::regprocedure,
      'public.room_select_media(uuid,bigint,uuid,boolean)'::regprocedure,
      'public.room_mark_ended(uuid,bigint)'::regprocedure,
      'public.room_play_next(uuid,bigint)'::regprocedure
    )
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  0::bigint,
  'PUBLIC has no playback-command EXECUTE privilege'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.lock_owned_playback_state(uuid,bigint)',
    'EXECUTE'
  ),
  'the lock/authorization helper is not a client RPC'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'room_playback_state'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ),
  0::bigint,
  'authenticated retains no direct playback-state write grant'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'room_playback_state'
      and cmd <> 'SELECT'
  ),
  0::bigint,
  'playback state has no direct client write policy'
);

insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'playback-owner-a@example.test', false, now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', null, true, now(), now()),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'playback-outsider-c@example.test', false, now(), now()),
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'playback-owner-d@example.test', false, now(), now());

create temporary table playback_context (
  key text primary key,
  value uuid not null
);
grant select, insert on table pg_temp.playback_context to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

insert into pg_temp.playback_context (key, value)
select 'room_a', room_id from public.create_room('Playback Room A');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}';

insert into pg_temp.playback_context (key, value)
select 'room_d', room_id from public.create_room('Playback Room D');

reset role;

insert into public.media_items (
  id, room_id, title, source_url, source_type, queue_position, created_by
)
values
  (
    '20000000-0000-4000-8000-0000000000a1',
    (select value from pg_temp.playback_context where key = 'room_a'),
    'Room A First',
    'https://media.example.test/a-first.mp4',
    'mp4', 0,
    '00000000-0000-4000-8000-0000000000a1'
  ),
  (
    '20000000-0000-4000-8000-0000000000a2',
    (select value from pg_temp.playback_context where key = 'room_a'),
    'Room A Second',
    'https://media.example.test/a-second.m3u8',
    'hls', 0,
    '00000000-0000-4000-8000-0000000000a1'
  ),
  (
    '20000000-0000-4000-8000-0000000000a3',
    (select value from pg_temp.playback_context where key = 'room_a'),
    'Room A Third',
    'https://media.example.test/a-third.mp4',
    'mp4', 5,
    '00000000-0000-4000-8000-0000000000a1'
  ),
  (
    '20000000-0000-4000-8000-0000000000d1',
    (select value from pg_temp.playback_context where key = 'room_d'),
    'Room D First',
    'https://media.example.test/d-first.mp4',
    'mp4', 0,
    '00000000-0000-4000-8000-0000000000d4'
  );

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select ok(
  (
    select result.current_media_id = '20000000-0000-4000-8000-0000000000a1'::uuid
      and result.status = 'paused'
      and result.anchor_position_sec = 0
      and result.state_version = 1
    from public.room_select_media(
      (select value from pg_temp.playback_context where key = 'room_a'),
      0,
      '20000000-0000-4000-8000-0000000000a1',
      false
    ) as result
  ),
  'select media paused resets the timeline and increments exactly once'
);

select ok(
  (
    select result.status = 'playing'
      and result.anchor_position_sec = 0
      and result.state_version = 2
    from public.room_play(
      (select value from pg_temp.playback_context where key = 'room_a'),
      1
    ) as result
  ),
  'owner Play resumes from the canonical paused anchor and increments once'
);

select is(
  (
    select result.state_version
    from public.room_play(
      (select value from pg_temp.playback_context where key = 'room_a'),
      2
    ) as result
  ),
  2::bigint,
  'Play while already playing is a deterministic no-op without version churn'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.room_play(%L::uuid, 1)',
    (select value::text from pg_temp.playback_context where key = 'room_a')
  )),
  '40001',
  'a stale expected version is a recognizable conflict'
);

reset role;

update public.room_playback_state
set
  anchor_server_time = pg_catalog.clock_timestamp() - interval '2 seconds',
  state_version = 3
where room_id = (select value from pg_temp.playback_context where key = 'room_a');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select ok(
  (
    select result.status = 'paused'
      and result.anchor_position_sec >= 1.9
      and result.anchor_position_sec < 3
      and result.state_version = 4
    from public.room_pause(
      (select value from pg_temp.playback_context where key = 'room_a'),
      3
    ) as result
  ),
  'Pause freezes position from database elapsed time rather than browser time'
);

select is(
  (
    select result.state_version
    from public.room_pause(
      (select value from pg_temp.playback_context where key = 'room_a'),
      4
    ) as result
  ),
  4::bigint,
  'Pause while already paused is a deterministic no-op'
);

select ok(
  (
    select result.status = 'paused'
      and result.anchor_position_sec = 12.346
      and result.state_version = 5
    from public.room_seek(
      (select value from pg_temp.playback_context where key = 'room_a'),
      4,
      12.34567
    ) as result
  ),
  'Seek normalizes precision and preserves paused intent'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.room_seek(%L::uuid, 5, -1)',
    (select value::text from pg_temp.playback_context where key = 'room_a')
  )),
  '22023',
  'Seek rejects negative targets at the database boundary'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.room_seek(%L::uuid, 5, ''NaN''::double precision)',
    (select value::text from pg_temp.playback_context where key = 'room_a')
  )),
  '22023',
  'Seek rejects NaN targets at the database boundary'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.room_seek(%L::uuid, 5, ''Infinity''::double precision)',
    (select value::text from pg_temp.playback_context where key = 'room_a')
  )),
  '22023',
  'Seek rejects infinite targets at the database boundary'
);

select ok(
  (
    select result.status = 'playing'
      and result.anchor_position_sec = 0
      and result.state_version = 6
    from public.room_select_media(
      (select value from pg_temp.playback_context where key = 'room_a'),
      5,
      '20000000-0000-4000-8000-0000000000a1',
      true
    ) as result
  ),
  'select media autoplay begins playback from zero'
);

select ok(
  (
    select result.status = 'playing'
      and result.anchor_position_sec = 30.125
      and result.state_version = 7
    from public.room_seek(
      (select value from pg_temp.playback_context where key = 'room_a'),
      6,
      30.125
    ) as result
  ),
  'Seek preserves playing intent'
);

select ok(
  (
    select result.status = 'playing'
      and result.anchor_position_sec = 0
      and result.state_version = 8
    from public.room_restart(
      (select value from pg_temp.playback_context where key = 'room_a'),
      7
    ) as result
  ),
  'Restart preserves playing intent and resets to zero'
);

select ok(
  (
    select result.status = 'ended'
      and result.state_version = 9
      and result.anchor_position_sec >= 0
    from public.room_mark_ended(
      (select value from pg_temp.playback_context where key = 'room_a'),
      8
    ) as result
  ),
  'Mark ended finalizes active playback and increments once'
);

select is(
  (
    select result.state_version
    from public.room_mark_ended(
      (select value from pg_temp.playback_context where key = 'room_a'),
      9
    ) as result
  ),
  9::bigint,
  'Mark ended while already ended is a deterministic no-op'
);

select ok(
  (
    select result.status = 'paused'
      and result.anchor_position_sec = 0
      and result.state_version = 10
    from public.room_restart(
      (select value from pg_temp.playback_context where key = 'room_a'),
      9
    ) as result
  ),
  'Restart from ended resets to a deliberate paused state'
);

select is(
  (
    select result.state_version
    from public.room_play(
      (select value from pg_temp.playback_context where key = 'room_a'),
      10
    ) as result
  ),
  11::bigint,
  'Play resumes the restarted ended item exactly once'
);

select ok(
  (
    select result.current_media_id = '20000000-0000-4000-8000-0000000000a2'::uuid
      and result.status = 'playing'
      and result.anchor_position_sec = 0
      and result.state_version = 12
    from public.room_play_next(
      (select value from pg_temp.playback_context where key = 'room_a'),
      11
    ) as result
  ),
  'Play Next selects the deterministic queue successor and starts it'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.room_play_next(%L::uuid, 11)',
    (select value::text from pg_temp.playback_context where key = 'room_a')
  )),
  '40001',
  'a stale Play Next retry conflicts instead of advancing twice'
);

select ok(
  (
    select current_media_id = '20000000-0000-4000-8000-0000000000a2'::uuid
      and state_version = 12
    from public.room_playback_state
    where room_id = (select value from pg_temp.playback_context where key = 'room_a')
  ),
  'stale Play Next leaves canonical media and version unchanged'
);

select ok(
  (
    select result.current_media_id = '20000000-0000-4000-8000-0000000000a3'::uuid
      and result.state_version = 13
    from public.room_play_next(
      (select value from pg_temp.playback_context where key = 'room_a'),
      12
    ) as result
  ),
  'Play Next advances by deterministic queue position then UUID'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.room_play_next(%L::uuid, 13)',
    (select value::text from pg_temp.playback_context where key = 'room_a')
  )),
  'P0002',
  'Play Next does not wrap after the final queue item'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.room_select_media(%L::uuid, 13, %L::uuid, true)',
    (select value::text from pg_temp.playback_context where key = 'room_a'),
    '20000000-0000-4000-8000-0000000000d1'
  )),
  '22023',
  'cross-room media selection is rejected before update'
);

select ok(
  (
    select exists (
      select 1
      from public.media_items as mi
      where mi.room_id = ps.room_id
        and mi.id = ps.current_media_id
    )
    from public.room_playback_state as ps
    where ps.room_id = (select value from pg_temp.playback_context where key = 'room_a')
  ),
  'canonical current media remains a valid same-room reference'
);

reset role;

select is(
  pg_temp.sqlstate_of(format(
    'update public.room_playback_state set state_version = 12 where room_id = %L::uuid',
    (select value::text from pg_temp.playback_context where key = 'room_a')
  )),
  '23514',
  'state_version can never move backward'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated","is_anonymous":true}';

select ok(
  (
    select count(*) = 1
    from public.join_room(
      (select value from pg_temp.playback_context where key = 'room_a'),
      'Viewer B'
    )
  ),
  'Viewer B is a durable authenticated room member for authorization testing'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.room_play(%L::uuid, 13)',
    (select value::text from pg_temp.playback_context where key = 'room_a')
  )),
  '42501',
  'joined Viewer B cannot invoke authoritative Play'
);

select is(
  pg_temp.sqlstate_of(format(
    'update public.room_playback_state set state_version = 14 where room_id = %L::uuid',
    (select value::text from pg_temp.playback_context where key = 'room_a')
  )),
  '42501',
  'joined Viewer B still has no direct playback-state update path'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}';

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.room_play(%L::uuid, 13)',
    (select value::text from pg_temp.playback_context where key = 'room_a')
  )),
  '42501',
  'Outsider C cannot invoke authoritative Play'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}';

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.room_play(%L::uuid, 0)',
    (select value::text from pg_temp.playback_context where key = 'room_d')
  )),
  '22023',
  'Play is invalid while a room is idle without current media'
);

select ok(
  (
    select result.current_media_id = '20000000-0000-4000-8000-0000000000d1'::uuid
      and result.status = 'playing'
      and result.state_version = 1
    from public.room_play_next(
      (select value from pg_temp.playback_context where key = 'room_d'),
      0
    ) as result
  ),
  'explicit Play Next from idle selects and starts the first queue item'
);

select ok(
  (
    select ps.updated_at >= ps.anchor_server_time
    from public.room_playback_state as ps
    where ps.room_id = (select value from pg_temp.playback_context where key = 'room_d')
  ),
  'updated_at is sampled coherently after the canonical anchor time'
);

select is(
  pg_temp.sqlstate_of(format(
    'select * from public.room_pause(%L::uuid, -1)',
    (select value::text from pg_temp.playback_context where key = 'room_d')
  )),
  '22023',
  'negative expected versions are rejected before mutation'
);

reset role;

select * from finish();
rollback;
