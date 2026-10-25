-- Transactional, server-side match commands. The client supplies an intent, never an official total.
create or replace function public.refresh_match_result(p_match_id uuid)
returns public.match_results language plpgsql security definer set search_path = public as $$
declare v_competition_id uuid; v_red numeric(12,2); v_blue numeric(12,2); v_breakdown jsonb; v_out public.match_results;
begin
  select competition_id into v_competition_id from public.matches where id = p_match_id;
  if not found then raise exception 'match not found' using errcode='P0002'; end if;
  select coalesce(sum(case when alliance='red' then points_awarded else 0 end),0), coalesce(sum(case when alliance='blue' then points_awarded else 0 end),0)
  into v_red, v_blue from public.score_events where match_id=p_match_id and reversed_at is null;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_breakdown from (
    select coalesce(alliance::text,'unassigned') || ':' || coalesce(rule_snapshot->>'display_name','manual') as key, sum(points_awarded) as value
    from public.score_events where match_id=p_match_id and reversed_at is null group by 1
  ) b;
  insert into public.match_results(match_id,competition_id,red_score,blue_score,breakdown,winner,calculated_at)
  values(p_match_id,v_competition_id,v_red,v_blue,v_breakdown,case when v_red > v_blue then 'red'::public.alliance_color when v_blue > v_red then 'blue'::public.alliance_color else null end,now())
  on conflict(match_id) do update set red_score=excluded.red_score,blue_score=excluded.blue_score,breakdown=excluded.breakdown,winner=excluded.winner,calculated_at=excluded.calculated_at
  returning * into v_out;
  return v_out;
end $$;

create or replace function public.refresh_override_result(p_match_id uuid)
returns public.match_results language plpgsql security definer set search_path = public as $$
declare v_tally public.override_match_tallies; v_comp uuid; v_scores record; v_out public.match_results;
begin
  select * into v_tally from public.override_match_tallies where match_id=p_match_id for update;
  if not found then raise exception 'override tally not found' using errcode='P0002'; end if;
  select competition_id into v_comp from public.matches where id=p_match_id;
  select * into v_scores from public.override_scores(v_tally);
  insert into public.match_results(match_id,competition_id,red_score,blue_score,breakdown,winner,calculated_at,calculation_version)
  values(p_match_id,v_comp,v_scores.red_score,v_scores.blue_score,jsonb_build_object('manual_version',v_tally.manual_version,'alliance_pin_half',5,'owned_yellow_pin_half',10,'robot_in_midfield',8,'autonomous_bonus',12),case when v_scores.red_score>v_scores.blue_score then 'red'::public.alliance_color when v_scores.blue_score>v_scores.red_score then 'blue'::public.alliance_color else null end,now(),v_tally.config_version)
  on conflict(match_id) do update set red_score=excluded.red_score,blue_score=excluded.blue_score,breakdown=excluded.breakdown,winner=excluded.winner,calculated_at=excluded.calculated_at,calculation_version=excluded.calculation_version
  returning * into v_out;
  return v_out;
end $$;

create or replace function public.resolve_controller_session(p_session_token text, p_competition_id uuid)
returns table(controller_link_id uuid, permissions jsonb) language plpgsql security definer set search_path = public as $$
declare v_hash text;
begin
  if p_session_token is null or char_length(p_session_token) < 32 then return; end if;
  v_hash := encode(digest(p_session_token,'sha256'),'hex');
  return query
  select cl.id, cl.permissions from public.controller_sessions cs
  join public.controller_links cl on cl.id=cs.controller_link_id
  where cs.session_hash=v_hash and cs.expires_at > now() and cs.revoked_at is null and cl.competition_id=p_competition_id and cl.expires_at > now() and cl.revoked_at is null;
end $$;

create or replace function public.match_action(
  p_match_id uuid,
  p_action jsonb,
  p_idempotency_key uuid,
  p_expected_timer_version integer default null,
  p_controller_session text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_match public.matches; v_comp public.competitions; v_role public.member_role; v_user uuid := auth.uid();
  v_controller uuid; v_permissions jsonb := '{}'::jsonb; v_action text := p_action->>'action'; v_rule public.scoring_rules;
  v_quantity numeric; v_points numeric; v_alliance public.alliance_color; v_team uuid; v_period text; v_reason text;
  v_elapsed integer; v_command text; v_target uuid; v_existing uuid; v_tally public.override_match_tallies; v_result public.match_results; v_previous_timer jsonb;
begin
  if p_action is null or v_action is null then raise exception 'missing action' using errcode='22023'; end if;
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'match not found' using errcode='P0002'; end if;
  select * into v_comp from public.competitions where id=v_match.competition_id;
  if p_controller_session is not null then
    select controller_link_id, permissions into v_controller, v_permissions from public.resolve_controller_session(p_controller_session,v_match.competition_id);
    if v_controller is null then raise exception 'invalid, expired, or revoked controller session' using errcode='42501'; end if;
  else
    v_role := public.current_competition_role(v_match.competition_id,v_user);
    if v_role is null then raise exception 'not authorized for this competition' using errcode='42501'; end if;
  end if;
  if v_match.status in ('finalized','void') and v_action not in ('read') then raise exception 'finalized or void matches cannot be changed' using errcode='55000'; end if;

  if v_action in ('score','correction') then
    if (v_controller is not null and not coalesce((v_permissions->>'score')::boolean,false)) or (v_controller is null and v_role not in ('owner','administrator','scorekeeper')) then raise exception 'not permitted to score' using errcode='42501'; end if;
    if v_controller is not null and jsonb_array_length(coalesce(v_permissions->'match_ids','[]'::jsonb)) > 0 and not (v_permissions->'match_ids' ? p_match_id::text) then raise exception 'controller link is not scoped to this match' using errcode='42501'; end if;
    select id into v_existing from public.score_events where match_id=p_match_id and idempotency_key=p_idempotency_key;
    if v_existing is not null then return jsonb_build_object('status','idempotent','event_id',v_existing,'state_version',v_match.state_version); end if;
    select * into v_rule from public.scoring_rules where id=(p_action->>'rule_id')::uuid and competition_id=v_match.competition_id and is_active and superseded_at is null for share;
    if not found then raise exception 'scoring rule is unavailable' using errcode='22023'; end if;
    v_quantity := (p_action->>'quantity')::numeric;
    if v_quantity is null or v_quantity < v_rule.min_quantity or (v_rule.max_quantity is not null and v_quantity > v_rule.max_quantity) or (not v_rule.allow_negative and v_quantity < 0) then raise exception 'quantity is outside permitted rule limits' using errcode='22023'; end if;
    v_alliance := nullif(p_action->>'alliance','')::public.alliance_color;
    v_team := nullif(p_action->>'team_id','')::uuid;
    v_period := coalesce(nullif(p_action->>'period_key',''),v_match.active_period_key);
    v_reason := nullif(btrim(p_action->>'reason'),'');
    if v_rule.applies_to='alliance' and v_alliance is null then raise exception 'alliance is required by this rule' using errcode='22023'; end if;
    if v_rule.applies_to='team' and v_team is null then raise exception 'team is required by this rule' using errcode='22023'; end if;
    if not ('any'=any(v_rule.allowed_periods) or v_period=any(v_rule.allowed_periods)) then raise exception 'this rule is not available in the selected period' using errcode='22023'; end if;
    if (v_rule.confirmation_required or v_action='correction') and v_reason is null then raise exception 'a correction reason is required' using errcode='22023'; end if;
    v_points := round((case when v_rule.scoring_type='zero_point' then 0 when v_rule.formula is null then v_quantity else public.safe_formula_value(v_rule.formula,v_quantity) end * v_rule.points_per_unit * v_rule.multiplier)::numeric,2);
    insert into public.score_events(competition_id,match_id,team_id,alliance,rule_id,rule_snapshot,event_type,quantity,points_awarded,period_key,reason,actor_user_id,actor_controller_link_id,idempotency_key)
    values(v_match.competition_id,p_match_id,v_team,v_alliance,v_rule.id,to_jsonb(v_rule),case when v_action='correction' then 'correction'::public.event_type else 'score'::public.event_type end,v_quantity,v_points,v_period,v_reason,v_user,v_controller,p_idempotency_key);
    update public.matches set state_version=state_version+1 where id=p_match_id returning * into v_match;
    v_result := public.refresh_match_result(p_match_id);
    insert into public.audit_logs(competition_id,actor_user_id,action,entity_type,entity_id,details) values(v_match.competition_id,v_user,'score.recorded','score_event',p_match_id::text,jsonb_build_object('rule_id',v_rule.id,'points',v_points,'controller_link_id',v_controller));
    return jsonb_build_object('status','accepted','state_version',v_match.state_version,'red_score',v_result.red_score,'blue_score',v_result.blue_score);
  end if;

  if v_action='undo' then
    if (v_controller is not null and not coalesce((v_permissions->>'undo')::boolean,false)) or (v_controller is null and v_role not in ('owner','administrator','scorekeeper')) then raise exception 'not permitted to undo' using errcode='42501'; end if;
    v_target := (p_action->>'target_event_id')::uuid;
    select id into v_existing from public.score_events where id=v_target and match_id=p_match_id and reversed_at is null for update;
    if v_existing is null then raise exception 'eligible event not found' using errcode='P0002'; end if;
    if v_role='scorekeeper' and v_controller is null and not exists(select 1 from public.score_events where id=v_target and actor_user_id=v_user) then raise exception 'scorekeepers may only undo their own event' using errcode='42501'; end if;
    update public.score_events set reversed_at=now(),reversed_by=v_user,reversal_reason=coalesce(nullif(btrim(p_action->>'reason'),''),'Undone by authorized operator') where id=v_target;
    update public.matches set state_version=state_version+1 where id=p_match_id returning * into v_match;
    v_result:=public.refresh_match_result(p_match_id);
    insert into public.audit_logs(competition_id,actor_user_id,action,entity_type,entity_id,details) values(v_match.competition_id,v_user,'score.undone','score_event',v_target::text,jsonb_build_object('controller_link_id',v_controller));
    return jsonb_build_object('status','accepted','state_version',v_match.state_version,'red_score',v_result.red_score,'blue_score',v_result.blue_score);
  end if;

  if v_action='timer' then
    if (v_controller is not null and not coalesce((v_permissions->>'timer')::boolean,false)) or (v_controller is null and v_role not in ('owner','administrator','scorekeeper')) then raise exception 'not permitted to operate timer' using errcode='42501'; end if;
    if p_expected_timer_version is null or p_expected_timer_version <> v_match.timer_version then raise exception 'timer state has changed; refresh and retry' using errcode='40001'; end if;
    select id into v_existing from public.timer_events where match_id=p_match_id and idempotency_key=p_idempotency_key;
    if v_existing is not null then return jsonb_build_object('status','idempotent','timer_version',v_match.timer_version,'state_version',v_match.state_version); end if;
    v_command:=p_action->>'command';
    if v_command not in ('start','pause','resume','stop','reset','next_period') then raise exception 'invalid timer command' using errcode='22023'; end if;
    v_previous_timer := jsonb_build_object('status',v_match.timer_status,'elapsed_ms',v_match.timer_elapsed_ms,'started_at',v_match.timer_started_at);
    v_elapsed := v_match.timer_elapsed_ms + case when v_match.timer_status='running' and v_match.timer_started_at is not null then greatest(0,extract(epoch from(now()-v_match.timer_started_at))*1000)::integer else 0 end;
    if v_command in ('start','resume') then
      if v_command='start' and v_match.timer_status not in ('idle','stopped','complete') then raise exception 'timer cannot be started from current state' using errcode='55000'; end if;
      if v_command='resume' and v_match.timer_status <> 'paused' then raise exception 'timer is not paused' using errcode='55000'; end if;
      update public.matches set timer_status='running',timer_started_at=now(),timer_elapsed_ms=case when v_command='start' then 0 else v_elapsed end,timer_version=timer_version+1,state_version=state_version+1,status='running',started_at=coalesce(started_at,now()) where id=p_match_id returning * into v_match;
    elsif v_command='pause' then
      if v_match.timer_status<>'running' then raise exception 'timer is not running' using errcode='55000'; end if;
      update public.matches set timer_status='paused',timer_started_at=null,timer_elapsed_ms=v_elapsed,timer_version=timer_version+1,state_version=state_version+1,status='paused' where id=p_match_id returning * into v_match;
    elsif v_command='stop' then
      update public.matches set timer_status='stopped',timer_started_at=null,timer_elapsed_ms=v_elapsed,timer_version=timer_version+1,state_version=state_version+1,status='ready' where id=p_match_id returning * into v_match;
    elsif v_command='reset' then
      if v_controller is not null or v_role not in ('owner','administrator') then raise exception 'only an administrator may reset a timer' using errcode='42501'; end if;
      update public.matches set timer_status='idle',timer_started_at=null,timer_elapsed_ms=0,timer_version=timer_version+1,state_version=state_version+1,status='ready' where id=p_match_id returning * into v_match;
    else
      update public.matches set active_period_key=coalesce(nullif(p_action->>'period_key',''),active_period_key),timer_status='paused',timer_started_at=null,timer_elapsed_ms=v_elapsed,timer_version=timer_version+1,state_version=state_version+1,status='paused' where id=p_match_id returning * into v_match;
    end if;
    insert into public.timer_events(competition_id,match_id,command,previous_state,resulting_state,expected_version,resulting_version,actor_user_id,actor_controller_link_id,idempotency_key)
    values(v_match.competition_id,p_match_id,v_command,v_previous_timer,jsonb_build_object('status',v_match.timer_status,'elapsed_ms',v_match.timer_elapsed_ms,'started_at',v_match.timer_started_at),p_expected_timer_version,v_match.timer_version,v_user,v_controller,p_idempotency_key);
    insert into public.audit_logs(competition_id,actor_user_id,action,entity_type,entity_id,details) values(v_match.competition_id,v_user,'timer.'||v_command,'match',p_match_id::text,jsonb_build_object('controller_link_id',v_controller));
    return jsonb_build_object('status','accepted','timer_version',v_match.timer_version,'state_version',v_match.state_version);
  end if;

  if v_action='override_tally' then
    if v_comp.game_type <> 'vex_override_2026' then raise exception 'not an Override match' using errcode='22023'; end if;
    if (v_controller is not null and not coalesce((v_permissions->>'score')::boolean,false)) or (v_controller is null and v_role not in ('owner','administrator','scorekeeper')) then raise exception 'not permitted to score' using errcode='42501'; end if;
    insert into public.override_match_tallies(match_id,manual_version,updated_by) values(p_match_id,coalesce(v_comp.official_manual_version,'2.1'),v_user) on conflict(match_id) do nothing;
    update public.override_match_tallies set
      red_alliance_pin_halves=coalesce((p_action->>'red_alliance_pin_halves')::integer,red_alliance_pin_halves),
      blue_alliance_pin_halves=coalesce((p_action->>'blue_alliance_pin_halves')::integer,blue_alliance_pin_halves),
      quadrant_yellow_owned_by_red=coalesce((p_action->>'quadrant_yellow_owned_by_red')::integer,quadrant_yellow_owned_by_red),
      quadrant_yellow_owned_by_blue=coalesce((p_action->>'quadrant_yellow_owned_by_blue')::integer,quadrant_yellow_owned_by_blue),
      midfield_yellow_owned_by_red=coalesce((p_action->>'midfield_yellow_owned_by_red')::integer,midfield_yellow_owned_by_red),
      midfield_yellow_owned_by_blue=coalesce((p_action->>'midfield_yellow_owned_by_blue')::integer,midfield_yellow_owned_by_blue),
      red_robots_in_midfield=coalesce((p_action->>'red_robots_in_midfield')::integer,red_robots_in_midfield),
      blue_robots_in_midfield=coalesce((p_action->>'blue_robots_in_midfield')::integer,blue_robots_in_midfield),
      autonomous_winner=coalesce(nullif(p_action->>'autonomous_winner',''),autonomous_winner),
      field_state=coalesce(p_action->'field_state',field_state),updated_at=now(),updated_by=v_user
    where match_id=p_match_id returning * into v_tally;
    update public.matches set state_version=state_version+1 where id=p_match_id returning * into v_match;
    v_result:=public.refresh_override_result(p_match_id);
    insert into public.audit_logs(competition_id,actor_user_id,action,entity_type,entity_id,details) values(v_match.competition_id,v_user,'override.tally_updated','match',p_match_id::text,jsonb_build_object('manual_version',v_tally.manual_version));
    return jsonb_build_object('status','accepted','state_version',v_match.state_version,'red_score',v_result.red_score,'blue_score',v_result.blue_score,'manual_version',v_tally.manual_version);
  end if;

  if v_action='finalize' then
    if (v_controller is not null and not coalesce((v_permissions->>'finalize')::boolean,false)) or (v_controller is null and v_role not in ('owner','administrator')) then raise exception 'only an administrator may finalize' using errcode='42501'; end if;
    if v_comp.game_type='vex_override_2026' then perform public.refresh_override_result(p_match_id); else perform public.refresh_match_result(p_match_id); end if;
    update public.matches set status='finalized',finalized_at=now(),finalized_by=v_user,ended_at=coalesce(ended_at,now()),state_version=state_version+1 where id=p_match_id returning * into v_match;
    update public.match_results set is_final=true where match_id=p_match_id;
    insert into public.audit_logs(competition_id,actor_user_id,action,entity_type,entity_id,details) values(v_match.competition_id,v_user,'match.finalized','match',p_match_id::text,jsonb_build_object('controller_link_id',v_controller));
    return jsonb_build_object('status','accepted','state_version',v_match.state_version,'finalized_at',v_match.finalized_at);
  end if;
  raise exception 'unsupported action' using errcode='22023';
end $$;

grant execute on function public.match_action(uuid,jsonb,uuid,integer,text) to authenticated, anon;
grant execute on function public.resolve_controller_session(text,uuid) to authenticated, anon;
revoke all on function public.refresh_match_result(uuid) from public;
revoke all on function public.refresh_override_result(uuid) from public;
