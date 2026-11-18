-- v7: 관리자 화면에서 비밀번호 바꾸기 (지금 비밀번호를 확인한 뒤에만)
create or replace function rp_admin_change_password(p_old text, p_new text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not rp_admin_ok(p_old) then raise exception 'not admin'; end if;
  if char_length(coalesce(p_new, '')) < 4 then raise exception 'too short'; end if;
  update rp_settings set value = to_jsonb(extensions.crypt(p_new, extensions.gen_salt('bf'))) where key = 'admin_hash';
  return true;
end $$;
revoke execute on function rp_admin_change_password(text, text) from public;
grant execute on function rp_admin_change_password(text, text) to anon, authenticated;
