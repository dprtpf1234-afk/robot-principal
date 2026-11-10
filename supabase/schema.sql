-- 로봇 교장선생님 구하기! · Supabase(PostgreSQL) 설정
-- Supabase 대시보드 → SQL Editor 에 이 파일 내용을 통째로 붙여 넣고 Run 하면 된다. (여러 번 실행해도 괜찮다)
--
-- 보안 방식
--  · 표(table)는 학생 브라우저가 직접 읽거나 쓸 수 없다 (RLS 켜고 허용 규칙 없음).
--  · 게임은 아래 rp_ 로 시작하는 함수만 부를 수 있다. 함수가 순서·시간을 서버에서 검사한다.
--  · 기록 시간은 서버 시계(now)로 잰다. 관리자 함수는 관리자 비밀번호가 맞아야 동작한다.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- 표 ----------
create table if not exists rp_players (
  id bigserial primary key,
  grade int not null check (grade between 1 and 6),
  cls int not null check (cls between 1 and 20),
  num int not null check (num between 1 and 60),
  name text not null check (char_length(name) between 2 and 5),
  created_at timestamptz not null default now(),
  unique (grade, cls, num, name)
);

create table if not exists rp_attempts (
  id bigserial primary key,
  player_id bigint not null references rp_players(id) on delete cascade,
  mode text not null check (mode in ('m30', 'm10', 'free')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms bigint,
  penalty_ms bigint not null default 0,
  steps int[] not null default '{}',
  status text not null default 'playing'   -- playing | cleared | timeout | explore | invalid | quit
);
create index if not exists rp_attempts_player on rp_attempts(player_id);
create index if not exists rp_attempts_status on rp_attempts(status, mode);
create index if not exists rp_attempts_started on rp_attempts(started_at);

create table if not exists rp_settings (
  key text primary key,          -- 'admin_hash' | 'content'
  value jsonb not null
);

alter table rp_players enable row level security;
alter table rp_attempts enable row level security;
alter table rp_settings enable row level security;
revoke all on rp_players, rp_attempts, rp_settings from anon, authenticated;

-- ---------- 코스 규칙 (게임의 Util.course 와 같아야 한다) ----------
-- 단계: 30분·탐험 [1] → [2,3] → [4] → [5,6] → [7]
--       10분       [1] → [3,4] → [6] → [7]
create or replace function rp_course(p_mode text) returns int[][] language sql immutable as $$
  select case when p_mode = 'm10' then array[[1,0],[3,4],[6,0],[7,0]] else array[[1,0],[2,3],[4,8],[5,6],[7,0]] end
$$;
create or replace function rp_course_list(p_mode text) returns int[] language sql immutable as $$
  select case when p_mode = 'm10' then array[1,3,4,6,7] else array[1,2,3,4,8,5,6,7] end
$$;
-- 미션 o 의 앞 단계 미션들
create or replace function rp_prereq(p_mode text, p_order int) returns int[] language plpgsql immutable as $$
declare c int[][] := rp_course(p_mode); i int;
begin
  for i in 1 .. array_length(c, 1) loop
    if p_order = any(c[i:i][1:2]) then
      if i = 1 then return '{}'; end if;
      return array_remove(array[c[i-1][1], c[i-1][2]], 0);
    end if;
  end loop;
  return null;   -- 코스에 없는 미션
end $$;

create or replace function rp_limit_ms(p_mode text) returns bigint language sql immutable as $$
  select case p_mode when 'm30' then 1800000 when 'm10' then 600000 else 0 end::bigint
$$;

-- ---------- 학생용 함수 ----------
create or replace function rp_start_attempt(p_grade int, p_cls int, p_num int, p_name text, p_mode text)
returns json language plpgsql security definer set search_path = public as $$
declare pid bigint; aid bigint;
begin
  if p_mode not in ('m30', 'm10', 'free') then raise exception 'bad mode'; end if;
  if p_name !~ '^[가-힣]{2,5}$' then raise exception 'bad name'; end if;
  insert into rp_players(grade, cls, num, name) values (p_grade, p_cls, p_num, p_name)
    on conflict (grade, cls, num, name) do update set name = excluded.name
    returning id into pid;
  insert into rp_attempts(player_id, mode) values (pid, p_mode) returning id into aid;
  return json_build_object('attemptId', aid, 'playerId', pid);
end $$;

create or replace function rp_complete_step(p_attempt bigint, p_order int)
returns boolean language plpgsql security definer set search_path = public as $$
declare a rp_attempts; pre int[];
begin
  select * into a from rp_attempts where id = p_attempt for update;
  if not found or a.status <> 'playing' then return false; end if;
  pre := rp_prereq(a.mode, p_order);
  if pre is null or p_order = any(a.steps) or not (pre <@ a.steps) then return false; end if;
  update rp_attempts set steps = array_append(steps, p_order) where id = p_attempt;
  return true;
end $$;

create or replace function rp_get_attempt(p_attempt bigint)
returns json language sql security definer set search_path = public as $$
  select json_build_object('id', id, 'status', status, 'mode', mode, 'startedAt', (extract(epoch from started_at) * 1000)::bigint, 'steps', steps)
  from rp_attempts where id = p_attempt
$$;

create or replace function rp_abandon_attempt(p_attempt bigint)
returns boolean language sql security definer set search_path = public as $$
  update rp_attempts set status = 'quit', finished_at = now() where id = p_attempt and status = 'playing' returning true
$$;

-- 랭킹: 미션을 모두 깬 기록만, 학생별 최고 기록. p_group: g12(1~2학년) | g34(3~4학년) | g56(5~6학년) (예전 low·high도 받음), p_mode: all | m30 | m10
create or replace function rp_ranking_rows(p_group text, p_mode text)
returns table(player_id bigint, grade int, cls int, name text, best_ms bigint, at timestamptz, mode text, rank bigint)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (a.player_id) a.player_id, a.duration_ms, a.finished_at, a.mode
    from rp_attempts a
    where a.status = 'cleared' and a.mode <> 'free' and (p_mode = 'all' or a.mode = p_mode)
    order by a.player_id, a.duration_ms, a.finished_at
  )
  select b.player_id, p.grade, p.cls, p.name, b.duration_ms, b.finished_at, b.mode,
         row_number() over (order by b.duration_ms, b.finished_at)
  from best b join rp_players p on p.id = b.player_id
  where case p_group when 'g12' then p.grade <= 2 when 'g34' then p.grade between 3 and 4 when 'g56' then p.grade >= 5
                    when 'low' then p.grade <= 3 when 'high' then p.grade >= 4 else false end
$$;

create or replace function rp_finish_attempt(p_attempt bigint, p_timeout boolean default false, p_penalty bigint default 0)
returns json language plpgsql security definer set search_path = public as $$
declare a rp_attempts; p rp_players; lim bigint; dur bigint; st text; grp text; r record; tot bigint;
begin
  select * into a from rp_attempts where id = p_attempt for update;
  if not found then return null; end if;
  if a.status = 'playing' then
    dur := (extract(epoch from (now() - a.started_at)) * 1000)::bigint + greatest(0, coalesce(p_penalty, 0));
    lim := rp_limit_ms(a.mode);
    st := case
      when p_timeout then 'timeout'
      when array_length(a.steps, 1) is distinct from array_length(rp_course_list(a.mode), 1) then 'invalid'
      when a.mode = 'free' then 'explore'
      when lim > 0 and dur > lim + 5000 then 'timeout'
      else 'cleared' end;
    update rp_attempts set finished_at = now(), duration_ms = dur, penalty_ms = greatest(0, coalesce(p_penalty, 0)), status = st
      where id = p_attempt returning * into a;
  end if;
  select * into p from rp_players where id = a.player_id;
  grp := case when p.grade <= 2 then 'g12' when p.grade <= 4 then 'g34' else 'g56' end;
  select * into r from rp_ranking_rows(grp, case when a.mode = 'free' then 'all' else a.mode end) x where x.player_id = p.id;
  select count(*) into tot from rp_ranking_rows(grp, case when a.mode = 'free' then 'all' else a.mode end);
  return json_build_object('durationMs', a.duration_ms, 'penaltyMs', a.penalty_ms, 'status', a.status, 'mode', a.mode,
    'bestMs', r.best_ms, 'rank', r.rank, 'total', tot, 'group', grp);
end $$;

-- 학생 화면용 랭킹 (학년-반 이름 전체를 보여 준다)
create or replace function rp_ranking(p_group text, p_mode text default 'all', p_limit int default 30)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('rank', rank, 'label', grade || '-' || cls || ' ' || name, 'bestMs', best_ms, 'mode', mode) order by rank), '[]'::json)
  from (select * from rp_ranking_rows(p_group, p_mode) order by rank limit least(greatest(p_limit, 1), 100)) t
$$;

-- 접속자 수: 게임에 입장한 학생 수 (오늘은 한국 시간 기준)
create or replace function rp_visit_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'today', (select count(distinct player_id) from rp_attempts where started_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')),
    'total', (select count(distinct player_id) from rp_attempts))
$$;

create or replace function rp_get_content()
returns jsonb language sql stable security definer set search_path = public as $$
  select value from rp_settings where key = 'content'
$$;

-- ---------- 관리자 함수 (비밀번호 확인) ----------
create or replace function rp_admin_ok(p_pw text) returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from rp_settings where key = 'admin_hash' and value #>> '{}' = extensions.crypt(p_pw, value #>> '{}'))
$$;
create or replace function rp_admin_has_password() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from rp_settings where key = 'admin_hash')
$$;
-- 처음 한 번만 정할 수 있다. 바꾸려면 SQL Editor 에서: delete from rp_settings where key = 'admin_hash';
create or replace function rp_admin_set_password(p_pw text) returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from rp_settings where key = 'admin_hash') then return false; end if;
  if char_length(p_pw) < 4 then return false; end if;
  insert into rp_settings(key, value) values ('admin_hash', to_jsonb(extensions.crypt(p_pw, extensions.gen_salt('bf'))));
  return true;
end $$;
create or replace function rp_admin_check(p_pw text) returns boolean language sql stable security definer set search_path = public as $$
  select rp_admin_ok(p_pw)
$$;

create or replace function rp_admin_records(p_pw text) returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not rp_admin_ok(p_pw) then raise exception 'not admin'; end if;
  return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select p.id, p.grade, p.cls, p.num, p.name,
      (select min(duration_ms) from rp_attempts a where a.player_id = p.id and a.status = 'cleared') as "bestMs",
      (select count(*) from rp_attempts a where a.player_id = p.id) as tries,
      (select count(*) from rp_attempts a where a.player_id = p.id and a.status = 'cleared') as clears,
      (select (extract(epoch from max(started_at)) * 1000)::bigint from rp_attempts a where a.player_id = p.id) as "lastAt"
    from rp_players p) t);
end $$;

create or replace function rp_admin_delete_player(p_pw text, p_id bigint) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not rp_admin_ok(p_pw) then raise exception 'not admin'; end if;
  delete from rp_players where id = p_id;
  return true;
end $$;

create or replace function rp_admin_reset(p_pw text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not rp_admin_ok(p_pw) then raise exception 'not admin'; end if;
  delete from rp_attempts where true;
  delete from rp_players where true;
  return true;
end $$;

create or replace function rp_admin_save_content(p_pw text, p_content jsonb) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not rp_admin_ok(p_pw) then raise exception 'not admin'; end if;
  insert into rp_settings(key, value) values ('content', p_content) on conflict (key) do update set value = excluded.value;
  return true;
end $$;

create or replace function rp_admin_reset_content(p_pw text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not rp_admin_ok(p_pw) then raise exception 'not admin'; end if;
  delete from rp_settings where key = 'content';
  return true;
end $$;

-- 학생 브라우저(anon)는 rp_ 함수만 부를 수 있다
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'rp\_%' loop
    execute 'revoke execute on function ' || f.sig || ' from public';
  end loop;
end $$;
grant execute on function
  rp_start_attempt(int, int, int, text, text), rp_complete_step(bigint, int), rp_get_attempt(bigint), rp_abandon_attempt(bigint),
  rp_finish_attempt(bigint, boolean, bigint), rp_ranking(text, text, int), rp_visit_stats(), rp_get_content(),
  rp_admin_has_password(), rp_admin_set_password(text), rp_admin_check(text), rp_admin_records(text),
  rp_admin_delete_player(text, bigint), rp_admin_reset(text), rp_admin_save_content(text, jsonb), rp_admin_reset_content(text)
to anon, authenticated;
