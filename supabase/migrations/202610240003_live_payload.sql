-- Read payloads are also permission-gated for controller sessions, which do not carry a Supabase user JWT.
create or replace function public.match_live_payload(p_match_id uuid, p_controller_session text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_comp uuid; v_link uuid; v_permissions jsonb; v_payload jsonb;
begin
  select competition_id into v_comp from public.matches where id=p_match_id;
  if not found then raise exception 'match not found' using errcode='P0002'; end if;
  if p_controller_session is not null then
    select controller_link_id, permissions into v_link,v_permissions from public.resolve_controller_session(p_controller_session,v_comp);
    if v_link is null then raise exception 'invalid controller session' using errcode='42501'; end if;
    if jsonb_array_length(coalesce(v_permissions->'match_ids','[]'::jsonb)) > 0 and not (v_permissions->'match_ids' ? p_match_id::text) then raise exception 'controller is not scoped to this match' using errcode='42501'; end if;
  elsif not public.has_competition_access(v_comp,auth.uid()) then
    raise exception 'not authorized for this competition' using errcode='42501';
  end if;
  select payload into v_payload from public.match_live_state where match_id=p_match_id;
  return v_payload;
end $$;
grant execute on function public.match_live_payload(uuid,text) to authenticated, anon;

create or replace function public.public_display_payload(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_link public.public_display_links; v_hash text;
begin
  if p_token is null or char_length(p_token)<32 then raise exception 'display link unavailable' using errcode='42501'; end if;
  v_hash:=encode(digest(p_token,'sha256'),'hex');
  select * into v_link from public.public_display_links where token_hash=v_hash and revoked_at is null and (expires_at is null or expires_at>now());
  if not found then raise exception 'display link unavailable' using errcode='42501'; end if;
  return jsonb_build_object('competition_id',v_link.competition_id,'matches',coalesce((select jsonb_agg(payload) from public.match_live_state m join public.matches x on x.id=m.match_id where x.competition_id=v_link.competition_id),'[]'::jsonb));
end $$;
grant execute on function public.public_display_payload(text) to anon, authenticated;
