-- v8: 이름 대신 학년·반·번호로 구분하고 별명(선택)을 따로 저장. 학생 화면 랭킹은 학년·반만.
alter table rp_players add column if not exists nick text not null default '';
alter table rp_players drop constraint if exists rp_players_name_check;
alter table rp_players add constraint rp_players_name_check check (char_length(name) <= 5);
alter table rp_players drop constraint if exists rp_players_nick_check;
alter table rp_players add constraint rp_players_nick_check check (char_length(nick) <= 8);

-- 새 학생은 name = '' 로 저장 → (학년, 반, 번호, '') 가 한 학생. 예전 기록(실제 이름)은 그대로 남는다.
-- p_name 자리에는 별명(없으면 빈 칸)이 온다.
create or replace function rp_start_attempt(p_grade int, p_cls int, p_num int, p_name text, p_mode text)
returns json language plpgsql security definer set search_path = public as $$
declare pid bigint; aid bigint; nk text := coalesce(p_name, '');
begin
  if p_mode not in ('m30', 'm10', 'free') then raise exception 'bad mode'; end if;
  if p_grade not between 1 and 6 or p_cls not between 1 and 20 or p_num not between 1 and 50 then raise exception 'bad player'; end if;
  if nk !~ '^[가-힣A-Za-z0-9]{0,8}$' then raise exception 'bad nick'; end if;
  insert into rp_players(grade, cls, num, name, nick) values (p_grade, p_cls, p_num, '', nk)
    on conflict (grade, cls, num, name) do update set nick = excluded.nick
    returning id into pid;
  insert into rp_attempts(player_id, mode) values (pid, p_mode) returning id into aid;
  return json_build_object('attemptId', aid, 'playerId', pid);
end $$;

-- 학생 화면용 랭킹: 학년·반만
create or replace function rp_ranking(p_group text, p_mode text default 'all', p_limit int default 30)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('rank', rank, 'label', grade || '학년 ' || cls || '반', 'bestMs', best_ms, 'mode', mode) order by rank), '[]'::json)
  from (select * from rp_ranking_rows(p_group, p_mode) order by rank limit least(greatest(p_limit, 1), 100)) t
$$;

-- 관리자용 랭킹: 학년-반 번호 + 별명 (예전 기록은 이름)
create or replace function rp_admin_ranking(p_pw text, p_group text, p_mode text default 'all', p_limit int default 100)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not rp_admin_ok(p_pw) then raise exception 'not admin'; end if;
  return (select coalesce(json_agg(json_build_object('rank', t.rank,
            'label', t.grade || '-' || t.cls || ' ' || p.num || '번' || coalesce(' ' || nullif(p.nick, ''), ' ' || nullif(p.name, ''), ''),
            'bestMs', t.best_ms, 'mode', t.mode) order by t.rank), '[]'::json)
    from (select * from rp_ranking_rows(p_group, p_mode) order by rank limit least(greatest(p_limit, 1), 300)) t
    join rp_players p on p.id = t.player_id);
end $$;

-- 관리자 기록: 별명 칸 추가
create or replace function rp_admin_records(p_pw text) returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not rp_admin_ok(p_pw) then raise exception 'not admin'; end if;
  return (select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select p.id, p.grade, p.cls, p.num, p.name, p.nick,
      (select min(duration_ms) from rp_attempts a where a.player_id = p.id and a.status = 'cleared') as "bestMs",
      (select count(*) from rp_attempts a where a.player_id = p.id) as tries,
      (select count(*) from rp_attempts a where a.player_id = p.id and a.status = 'cleared') as clears,
      (select (extract(epoch from max(started_at)) * 1000)::bigint from rp_attempts a where a.player_id = p.id) as "lastAt"
    from rp_players p) t);
end $$;
