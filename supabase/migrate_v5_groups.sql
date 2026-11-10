-- v3.0: 랭킹을 학년군 3개(1~2·3~4·5~6학년)로 나눈다. Supabase SQL Editor에서 한 번 실행.
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

