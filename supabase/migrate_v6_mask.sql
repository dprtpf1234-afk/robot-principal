-- v6: 학생 화면 랭킹은 이름 가운데를 ○로 가리고(김○지), 관리자만 전체 이름을 본다
create or replace function rp_mask_name(p_name text) returns text language sql immutable as $$
  select case
    when char_length(coalesce(p_name, '')) <= 1 then coalesce(p_name, '')
    when char_length(p_name) = 2 then left(p_name, 1) || '○'
    else left(p_name, 1) || repeat('○', char_length(p_name) - 2) || right(p_name, 1)
  end
$$;

-- 학생 화면용 랭킹: 학년-반 + 가린 이름
create or replace function rp_ranking(p_group text, p_mode text default 'all', p_limit int default 30)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('rank', rank, 'label', grade || '-' || cls || ' ' || rp_mask_name(name), 'bestMs', best_ms, 'mode', mode) order by rank), '[]'::json)
  from (select * from rp_ranking_rows(p_group, p_mode) order by rank limit least(greatest(p_limit, 1), 100)) t
$$;

-- 관리자용 랭킹: 비밀번호를 확인하고 전체 이름을 돌려준다
create or replace function rp_admin_ranking(p_pw text, p_group text, p_mode text default 'all', p_limit int default 100)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not rp_admin_ok(p_pw) then raise exception 'not admin'; end if;
  return (select coalesce(json_agg(json_build_object('rank', rank, 'label', grade || '-' || cls || ' ' || name, 'bestMs', best_ms, 'mode', mode) order by rank), '[]'::json)
    from (select * from rp_ranking_rows(p_group, p_mode) order by rank limit least(greatest(p_limit, 1), 300)) t);
end $$;

revoke execute on function rp_mask_name(text) from public;
revoke execute on function rp_admin_ranking(text, text, text, int) from public;
grant execute on function rp_admin_ranking(text, text, text, int) to anon, authenticated;
