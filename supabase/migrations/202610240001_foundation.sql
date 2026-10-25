-- MatchForge foundation. Run with `supabase db push` against a new project.
-- This schema is intentionally event-sourced: `match_results` is a cache and never a client supplied total.
create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.competition_status as enum ('draft', 'active', 'completed', 'archived');
create type public.member_role as enum ('owner', 'administrator', 'scorekeeper', 'viewer');
create type public.match_status as enum ('scheduled', 'ready', 'running', 'paused', 'finalized', 'void');
create type public.timer_status as enum ('idle', 'running', 'paused', 'stopped', 'complete');
create type public.scoring_type as enum ('counter', 'fixed', 'numeric', 'boolean', 'penalty', 'timed', 'elapsed', 'distance', 'threshold', 'placement', 'milestone', 'combination', 'zero_point');
create type public.event_type as enum ('score', 'correction', 'undo', 'system');
create type public.alliance_color as enum ('red', 'blue');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_.-]{3,40}$'),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  description text check (description is null or char_length(description) <= 500),
  logo_path text,
  game_type text not null check (game_type in ('custom', 'vex_style', 'vex_override_2026')),
  status public.competition_status not null default 'draft',
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 80),
  settings jsonb not null default '{"allow_offline_queue":false,"public_scoreboard":false}'::jsonb,
  template_source_id uuid,
  official_manual_version text,
  configuration_version integer not null default 1 check (configuration_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.competition_members (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

create table public.competition_invitations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  email citext not null,
  role public.member_role not null check (role <> 'owner'),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  team_number text not null check (char_length(btrim(team_number)) between 1 and 40),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  color text not null default '#64748B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  alliance public.alliance_color,
  logo_path text,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, team_number)
);

-- Rules are append-only versions. completed matches keep a JSON snapshot on every event.
create table public.scoring_rules (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  version integer not null check (version > 0),
  rule_key text not null check (rule_key ~ '^[a-z0-9_:-]{2,80}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  scoring_type public.scoring_type not null,
  points_per_unit numeric(12,2) not null default 0 check (points_per_unit between -100000 and 100000),
  unit_label text not null default 'action' check (char_length(unit_label) between 1 and 40),
  quantity_increment numeric(12,3) not null default 1 check (quantity_increment > 0),
  min_quantity numeric(12,3) not null default 0,
  max_quantity numeric(12,3),
  allow_negative boolean not null default false,
  applies_to text not null default 'alliance' check (applies_to in ('team','alliance','match')),
  allowed_periods text[] not null default '{any}',
  multiplier numeric(12,4) not null default 1 check (multiplier between -10000 and 10000),
  prerequisites jsonb not null default '[]'::jsonb,
  repeatable boolean not null default true,
  confirmation_required boolean not null default false,
  button_label text not null check (char_length(btrim(button_label)) between 1 and 30),
  button_color text not null default '#38BDF8' check (button_color ~ '^#[0-9A-Fa-f]{6}$'),
  button_size text not null default 'regular' check (button_size in ('small','regular','large')),
  display_order integer not null default 0,
  is_active boolean not null default true,
  formula jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  check (max_quantity is null or max_quantity >= min_quantity),
  check (allow_negative or min_quantity >= 0),
  unique (competition_id, rule_key, version)
);
create unique index scoring_rules_one_current_key on public.scoring_rules(competition_id, rule_key) where superseded_at is null;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  match_number text not null check (char_length(btrim(match_number)) between 1 and 30),
  name text not null default 'Match' check (char_length(btrim(name)) between 1 and 100),
  status public.match_status not null default 'scheduled',
  scheduled_at timestamptz,
  format_snapshot jsonb not null default '{"periods":[{"key":"match","duration_ms":120000}]}'::jsonb,
  timer_mode text not null default 'countdown' check (timer_mode in ('countdown','countup')),
  timer_status public.timer_status not null default 'idle',
  timer_duration_ms integer not null default 120000 check (timer_duration_ms between 1000 and 14400000),
  timer_elapsed_ms integer not null default 0 check (timer_elapsed_ms >= 0),
  timer_started_at timestamptz,
  timer_version integer not null default 0 check (timer_version >= 0),
  active_period_key text not null default 'match',
  started_at timestamptz,
  ended_at timestamptz,
  finalized_at timestamptz,
  finalized_by uuid references public.profiles(id) on delete set null,
  state_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, match_number),
  check ((status <> 'finalized') or finalized_at is not null)
);

create table public.match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  alliance public.alliance_color,
  station smallint check (station between 1 and 8),
  created_at timestamptz not null default now(),
  unique (match_id, team_id),
  unique (match_id, alliance, station)
);

create table public.score_events (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid references public.teams(id) on delete restrict,
  alliance public.alliance_color,
  rule_id uuid references public.scoring_rules(id) on delete restrict,
  rule_snapshot jsonb not null default '{}'::jsonb,
  event_type public.event_type not null default 'score',
  quantity numeric(12,3) not null,
  points_awarded numeric(12,2) not null,
  period_key text,
  reason text check (reason is null or char_length(reason) between 1 and 500),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_controller_link_id uuid,
  idempotency_key uuid not null,
  occurred_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete set null,
  reversal_reason text,
  revision_of uuid references public.score_events(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  check (reason is not null or event_type not in ('correction','undo')),
  unique (match_id, idempotency_key)
);

create table public.match_results (
  match_id uuid primary key references public.matches(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  red_score numeric(12,2) not null default 0,
  blue_score numeric(12,2) not null default 0,
  team_scores jsonb not null default '{}'::jsonb,
  breakdown jsonb not null default '{}'::jsonb,
  winner public.alliance_color,
  is_final boolean not null default false,
  calculated_at timestamptz not null default now(),
  calculation_version integer not null default 1
);

create table public.timer_events (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  command text not null check (command in ('start','pause','resume','stop','reset','next_period','complete')),
  previous_state jsonb not null,
  resulting_state jsonb not null,
  expected_version integer not null,
  resulting_version integer not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_controller_link_id uuid,
  idempotency_key uuid not null,
  occurred_at timestamptz not null default now(),
  unique (match_id, idempotency_key)
);

-- Official Override is deliberately distinct from configurable counter rules.
create table public.override_match_tallies (
  match_id uuid primary key references public.matches(id) on delete cascade,
  manual_version text not null default '2.1',
  config_version integer not null default 1,
  red_alliance_pin_halves integer not null default 0 check (red_alliance_pin_halves between 0 and 126),
  blue_alliance_pin_halves integer not null default 0 check (blue_alliance_pin_halves between 0 and 126),
  quadrant_yellow_owned_by_red integer not null default 0 check (quadrant_yellow_owned_by_red between 0 and 126),
  quadrant_yellow_owned_by_blue integer not null default 0 check (quadrant_yellow_owned_by_blue between 0 and 126),
  midfield_yellow_owned_by_red integer not null default 0 check (midfield_yellow_owned_by_red between 0 and 126),
  midfield_yellow_owned_by_blue integer not null default 0 check (midfield_yellow_owned_by_blue between 0 and 126),
  red_robots_in_midfield integer not null default 0 check (red_robots_in_midfield between 0 and 2),
  blue_robots_in_midfield integer not null default 0 check (blue_robots_in_midfield between 0 and 2),
  autonomous_winner text not null default 'none' check (autonomous_winner in ('red','blue','tie','none')),
  field_state jsonb not null default '{"toggles":{"north":"yellow","east":"yellow","south":"yellow","west":"yellow"},"goals":{}}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.controller_links (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  token_hash text not null unique,
  permissions jsonb not null default '{"score":true,"timer":false,"undo":false,"finalize":false,"match_ids":[]}'::jsonb,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create table public.controller_sessions (
  id uuid primary key default gen_random_uuid(),
  controller_link_id uuid not null references public.controller_links(id) on delete cascade,
  session_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table public.public_display_links (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  label text not null,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.score_events add constraint score_events_controller_link_fk foreign key (actor_controller_link_id) references public.controller_links(id) on delete set null;
alter table public.timer_events add constraint timer_events_controller_link_fk foreign key (actor_controller_link_id) references public.controller_links(id) on delete set null;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  competition_id uuid references public.competitions(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 1 and 100),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  ip_hash text,
  user_agent text,
  occurred_at timestamptz not null default now()
);

create index competitions_owner_idx on public.competitions(owner_id, updated_at desc);
create index members_user_idx on public.competition_members(user_id, competition_id);
create index teams_competition_idx on public.teams(competition_id) where archived_at is null;
create index rules_competition_idx on public.scoring_rules(competition_id, display_order) where is_active and superseded_at is null;
create index matches_competition_idx on public.matches(competition_id, scheduled_at);
create index match_participants_match_idx on public.match_participants(match_id);
create index score_events_match_idx on public.score_events(match_id, occurred_at desc);
create index score_events_competition_idx on public.score_events(competition_id, occurred_at desc);
create index timer_events_match_idx on public.timer_events(match_id, occurred_at desc);
create index controller_links_competition_idx on public.controller_links(competition_id) where revoked_at is null;

create or replace function public.set_updated_at() returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger competitions_updated before update on public.competitions for each row execute function public.set_updated_at();
create trigger teams_updated before update on public.teams for each row execute function public.set_updated_at();
create trigger matches_updated before update on public.matches for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, coalesce(nullif(lower(new.raw_user_meta_data->>'username'), ''), 'user_' || substr(new.id::text, 1, 8)), nullif(new.raw_user_meta_data->>'display_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.add_owner_membership() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.competition_members(competition_id, user_id, role) values(new.id, new.owner_id, 'owner');
  return new;
end $$;
-- Set the pinned official manual version before persistence.
create or replace function public.prepare_competition_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is null then new.owner_id := auth.uid(); end if;
  if new.game_type = 'vex_override_2026' then new.official_manual_version := '2.1'; end if;
  return new;
end $$;
create trigger competitions_before_insert before insert on public.competitions for each row execute function public.prepare_competition_insert();
create trigger competitions_after_insert after insert on public.competitions for each row execute function public.add_owner_membership();

create or replace function public.current_competition_role(p_competition_id uuid, p_user_id uuid default auth.uid())
returns public.member_role language sql stable security definer set search_path = public as $$
  select role from public.competition_members where competition_id = p_competition_id and user_id = p_user_id
$$;
create or replace function public.has_competition_access(p_competition_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.competition_members where competition_id = p_competition_id and user_id = p_user_id)
$$;
create or replace function public.can_manage_competition(p_competition_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_competition_role(p_competition_id,p_user_id) in ('owner','administrator'),false)
$$;
create or replace function public.can_score_competition(p_competition_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_competition_role(p_competition_id,p_user_id) in ('owner','administrator','scorekeeper'),false)
$$;

-- A deliberately restricted evaluator. No SQL, Javascript, or arbitrary expression strings are accepted.
create or replace function public.safe_formula_value(p_node jsonb, p_value numeric, p_depth integer default 0)
returns numeric language plpgsql immutable strict set search_path = public as $$
declare op text; l numeric; r numeric;
begin
  if p_depth > 12 then raise exception 'formula exceeds maximum depth' using errcode='22023'; end if;
  op := p_node->>'op';
  if op = 'value' then return p_value; end if;
  if op = 'const' then return (p_node->>'value')::numeric; end if;
  if op in ('add','subtract','multiply','min','max') then
    l := public.safe_formula_value(p_node->'left', p_value, p_depth + 1);
    r := public.safe_formula_value(p_node->'right', p_value, p_depth + 1);
    if op = 'add' then return l + r; end if;
    if op = 'subtract' then return l - r; end if;
    if op = 'multiply' then return l * r; end if;
    if op = 'min' then return least(l,r); end if;
    return greatest(l,r);
  end if;
  if op = 'clamp' then return least((p_node->>'max')::numeric, greatest((p_node->>'min')::numeric, public.safe_formula_value(p_node->'value', p_value, p_depth + 1))); end if;
  raise exception 'invalid formula node' using errcode='22023';
end $$;

create or replace function public.override_scores(p_tally public.override_match_tallies)
returns table(red_score numeric, blue_score numeric) language sql stable set search_path = public as $$
  select
    (p_tally.red_alliance_pin_halves * 5 + (p_tally.quadrant_yellow_owned_by_red + p_tally.midfield_yellow_owned_by_red) * 10 + p_tally.red_robots_in_midfield * 8 + case p_tally.autonomous_winner when 'red' then 12 when 'tie' then 6 else 0 end)::numeric,
    (p_tally.blue_alliance_pin_halves * 5 + (p_tally.quadrant_yellow_owned_by_blue + p_tally.midfield_yellow_owned_by_blue) * 10 + p_tally.blue_robots_in_midfield * 8 + case p_tally.autonomous_winner when 'blue' then 12 when 'tie' then 6 else 0 end)::numeric
$$;

create or replace function public.seed_competition_defaults() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.game_type = 'vex_override_2026' then
    insert into public.scoring_rules (competition_id,version,rule_key,display_name,description,scoring_type,points_per_unit,unit_label,quantity_increment,min_quantity,max_quantity,applies_to,allowed_periods,button_label,button_color,display_order,created_by)
    values
      (new.id,1,'override_alliance_pin_half','Alliance-colored Pin Half','Official VEX V5RC Override v2.1 tally input. Final scoring only.', 'counter',5,'pin half',1,0,126,'alliance','{final}','+1 pin half','#38BDF8',1,new.owner_id),
      (new.id,1,'override_owned_yellow_pin_half','Owned Yellow Pin Half','Official VEX V5RC Override v2.1 tally input. Ownership is resolved by Toggle / Midfield state.', 'counter',10,'owned half',1,0,126,'alliance','{final}','+1 owned half','#F59E0B',2,new.owner_id),
      (new.id,1,'override_midfield_robot','Robot in Midfield','Official VEX V5RC Override v2.1 tally input. Final scoring only.', 'counter',8,'robot',1,0,2,'alliance','{final}','+1 Midfield','#8B5CF6',3,new.owner_id);
  end if;
  return new;
end $$;
create trigger competitions_seed_defaults after insert on public.competitions for each row execute function public.seed_competition_defaults();

-- Owner cannot be demoted/deleted through a direct member operation.
create or replace function public.protect_owner_membership() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and old.role = 'owner' then raise exception 'competition owner cannot be removed'; end if;
  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then raise exception 'competition owner cannot be demoted'; end if;
  return coalesce(new,old);
end $$;
create trigger members_protect_owner before update or delete on public.competition_members for each row execute function public.protect_owner_membership();

alter table public.profiles enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_members enable row level security;
alter table public.competition_invitations enable row level security;
alter table public.teams enable row level security;
alter table public.scoring_rules enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.score_events enable row level security;
alter table public.match_results enable row level security;
alter table public.timer_events enable row level security;
alter table public.override_match_tallies enable row level security;
alter table public.controller_links enable row level security;
alter table public.controller_sessions enable row level security;
alter table public.public_display_links enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_self on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy competitions_select_member on public.competitions for select to authenticated using (public.has_competition_access(id));
create policy competitions_insert_owner on public.competitions for insert to authenticated with check (owner_id = auth.uid());
create policy competitions_update_manager on public.competitions for update to authenticated using (public.can_manage_competition(id)) with check (public.can_manage_competition(id));
create policy competitions_delete_owner on public.competitions for delete to authenticated using (public.current_competition_role(id) = 'owner');
create policy members_select_member on public.competition_members for select to authenticated using (public.has_competition_access(competition_id));
create policy members_write_manager on public.competition_members for all to authenticated using (public.can_manage_competition(competition_id)) with check (public.can_manage_competition(competition_id));
create policy invitations_manage on public.competition_invitations for all to authenticated using (public.can_manage_competition(competition_id)) with check (public.can_manage_competition(competition_id));
create policy teams_read_member on public.teams for select to authenticated using (public.has_competition_access(competition_id));
create policy teams_write_manager on public.teams for all to authenticated using (public.can_manage_competition(competition_id)) with check (public.can_manage_competition(competition_id));
create policy rules_read_member on public.scoring_rules for select to authenticated using (public.has_competition_access(competition_id));
create policy rules_write_manager on public.scoring_rules for all to authenticated using (public.can_manage_competition(competition_id)) with check (public.can_manage_competition(competition_id));
create policy matches_read_member on public.matches for select to authenticated using (public.has_competition_access(competition_id));
create policy matches_write_manager on public.matches for all to authenticated using (public.can_manage_competition(competition_id)) with check (public.can_manage_competition(competition_id));
create policy participants_read_member on public.match_participants for select to authenticated using (exists(select 1 from public.matches m where m.id = match_id and public.has_competition_access(m.competition_id)));
create policy participants_write_manager on public.match_participants for all to authenticated using (exists(select 1 from public.matches m where m.id = match_id and public.can_manage_competition(m.competition_id))) with check (exists(select 1 from public.matches m where m.id = match_id and public.can_manage_competition(m.competition_id)));
create policy events_read_member on public.score_events for select to authenticated using (public.has_competition_access(competition_id));
create policy results_read_member on public.match_results for select to authenticated using (public.has_competition_access(competition_id));
create policy timers_read_member on public.timer_events for select to authenticated using (public.has_competition_access(competition_id));
create policy override_read_member on public.override_match_tallies for select to authenticated using (exists(select 1 from public.matches m where m.id = match_id and public.has_competition_access(m.competition_id)));
create policy controller_links_manage on public.controller_links for all to authenticated using (public.can_manage_competition(competition_id)) with check (public.can_manage_competition(competition_id));
create policy display_links_manage on public.public_display_links for all to authenticated using (public.can_manage_competition(competition_id)) with check (public.can_manage_competition(competition_id));
create policy audit_read_manager on public.audit_logs for select to authenticated using (public.can_manage_competition(competition_id));

-- `match_live_state` exposes a single server-built payload to authenticated, authorized clients.
create or replace view public.match_live_state with (security_invoker = true) as
select m.id as match_id,
jsonb_build_object(
  'id',m.id,'competitionId',m.competition_id,'number',m.match_number,'name',m.name,'status',m.status,'scheduledAt',m.scheduled_at,
  'timer',jsonb_build_object('status',m.timer_status,'mode',m.timer_mode,'durationMs',m.timer_duration_ms,'elapsedBeforeMs',m.timer_elapsed_ms,'startedAt',m.timer_started_at,'version',m.timer_version,'activePeriodKey',m.active_period_key),
  'redScore',coalesce(r.red_score,0),'blueScore',coalesce(r.blue_score,0),
  'participants',coalesce((select jsonb_agg(jsonb_build_object('id',mp.id,'teamId',t.id,'alliance',mp.alliance,'station',mp.station,'team',jsonb_build_object('id',t.id,'number',t.team_number,'name',t.name,'color',t.color,'alliance',t.alliance))) from public.match_participants mp join public.teams t on t.id=mp.team_id where mp.match_id=m.id),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'matchId',e.match_id,'competitionId',e.competition_id,'teamId',e.team_id,'alliance',e.alliance,'ruleId',e.rule_id,'eventType',e.event_type,'quantity',e.quantity,'pointsAwarded',e.points_awarded,'periodKey',e.period_key,'reason',e.reason,'actorLabel',coalesce(p.display_name,p.username,'Controller'),'occurredAt',e.occurred_at,'reversedAt',e.reversed_at,'revisionOf',e.revision_of) order by e.occurred_at desc) from public.score_events e left join public.profiles p on p.id=e.actor_user_id where e.match_id=m.id),'[]'::jsonb)
) as payload
from public.matches m left join public.match_results r on r.match_id=m.id;

grant select on public.match_live_state to authenticated;
revoke all on public.controller_sessions from anon, authenticated;
