-- v9: 학년별 반 수 (1학년 4반, 2학년 5반, 3학년 6반, 4학년 8반, 5학년 8반, 6학년 9반), 번호는 25번까지
create or replace function rp_start_attempt(p_grade int, p_cls int, p_num int, p_name text, p_mode text)
returns json language plpgsql security definer set search_path = public as $$
declare pid bigint; aid bigint; nk text := coalesce(p_name, '');
  maxcls int := case p_grade when 1 then 4 when 2 then 5 when 3 then 6 when 4 then 8 when 5 then 8 when 6 then 9 else 0 end;
begin
  if p_mode not in ('m30', 'm10', 'free') then raise exception 'bad mode'; end if;
  if p_cls not between 1 and maxcls or p_num not between 1 and 25 then raise exception 'bad player'; end if;
  if nk !~ '^[가-힣A-Za-z0-9]{0,8}$' then raise exception 'bad nick'; end if;
  insert into rp_players(grade, cls, num, name, nick) values (p_grade, p_cls, p_num, '', nk)
    on conflict (grade, cls, num, name) do update set nick = excluded.nick
    returning id into pid;
  insert into rp_attempts(player_id, mode) values (pid, p_mode) returning id into aid;
  return json_build_object('attemptId', aid, 'playerId', pid);
end $$;
