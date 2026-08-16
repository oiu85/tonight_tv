create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions;

select plan(4);

drop role if exists playback_race_test_client;
create temporary table playback_race_credentials (
  password text not null
);

do $$
declare
  generated_password text := pg_catalog.gen_random_uuid()::text;
begin
  insert into pg_temp.playback_race_credentials (password)
  values (generated_password);

  execute pg_catalog.format(
    'create role playback_race_test_client login password %L in role authenticated',
    generated_password
  );
end;
$$;

delete from public.rooms
where id = '50000000-0000-4000-8000-000000000001';
delete from auth.users
where id = '00000000-0000-4000-8000-0000000000e5';

insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
values (
  '00000000-0000-4000-8000-0000000000e5',
  'authenticated',
  'authenticated',
  'playback-race-owner@example.test',
  false,
  now(),
  now()
);

insert into public.rooms (id, owner_user_id, name)
values (
  '50000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-0000000000e5',
  'Playback Race Room'
);

insert into public.media_items (
  id, room_id, title, source_url, source_type, queue_position, created_by
)
values (
  '60000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'Race Media',
  'https://media.example.test/race.mp4',
  'mp4',
  0,
  '00000000-0000-4000-8000-0000000000e5'
);

insert into public.room_playback_state (
  room_id, current_media_id, status, anchor_position_sec, state_version
)
values (
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  'paused',
  5,
  0
);

create function pg_temp.dblink_result_sqlstate(connection_name text)
returns text
language plpgsql
as $$
begin
  perform *
  from extensions.dblink_get_result(connection_name)
    as result(state_version bigint);
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

do $$
declare
  connection_string text := pg_catalog.format(
    'host=%s port=5432 dbname=%I user=playback_race_test_client password=%s',
    pg_catalog.host(pg_catalog.inet_server_addr()),
    current_database(),
    (select password from pg_temp.playback_race_credentials)
  );
begin
  perform extensions.dblink_connect('playback_race_a', connection_string);
  perform extensions.dblink_connect('playback_race_b', connection_string);

  perform extensions.dblink_exec('playback_race_a', 'begin');
  perform extensions.dblink_exec('playback_race_a', 'set local role authenticated');
  perform extensions.dblink_exec(
    'playback_race_a',
    'set local request.jwt.claims = ''{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}'''
  );

  perform extensions.dblink_exec('playback_race_b', 'begin');
  perform extensions.dblink_exec('playback_race_b', 'set local role authenticated');
  perform extensions.dblink_exec(
    'playback_race_b',
    'set local request.jwt.claims = ''{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}'''
  );

  perform extensions.dblink_send_query(
    'playback_race_a',
    'select state_version from public.room_play(''50000000-0000-4000-8000-000000000001'', 0)'
  );
end;
$$;

select is(
  (
    select result.state_version
    from extensions.dblink_get_result('playback_race_a')
      as result(state_version bigint)
  ),
  1::bigint,
  'the first owner request based on version zero succeeds once'
);

do $$
begin
  perform *
  from extensions.dblink_get_result('playback_race_a')
    as result(state_version bigint);
end;
$$;

do $$
begin
  perform extensions.dblink_send_query(
    'playback_race_b',
    'select state_version from public.room_play(''50000000-0000-4000-8000-000000000001'', 0)'
  );
  perform pg_catalog.pg_sleep(0.1);
end;
$$;

select is(
  extensions.dblink_is_busy('playback_race_b'),
  1,
  'the competing request waits on the playback row lock'
);

do $$
begin
  perform extensions.dblink_exec('playback_race_a', 'commit');
end;
$$;

select is(
  pg_temp.dblink_result_sqlstate('playback_race_b'),
  '40001',
  'the waiting request rechecks canonical version and conflicts after the lock'
);

do $$
begin
  perform *
  from extensions.dblink_get_result('playback_race_b')
    as result(state_version bigint);
end;
$$;

do $$
begin
  perform extensions.dblink_exec('playback_race_b', 'rollback');
  perform extensions.dblink_disconnect('playback_race_a');
  perform extensions.dblink_disconnect('playback_race_b');
end;
$$;

select ok(
  (
    select ps.status = 'playing'
      and ps.state_version = 1
      and ps.anchor_position_sec = 5
    from public.room_playback_state as ps
    where ps.room_id = '50000000-0000-4000-8000-000000000001'
  ),
  'two concurrent commands based on one version produce one canonical mutation'
);

delete from public.rooms
where id = '50000000-0000-4000-8000-000000000001';
delete from auth.users
where id = '00000000-0000-4000-8000-0000000000e5';
drop role playback_race_test_client;
drop extension dblink;

select * from finish();
