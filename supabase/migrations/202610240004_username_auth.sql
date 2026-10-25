-- Optional-email authentication support.
-- Accounts created through username-auth receive a non-routable internal Auth email and
-- are intentionally marked email_confirm=true. They do not have password recovery.
create table public.auth_rate_limits (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

alter table public.auth_rate_limits enable row level security;

create or replace function public.consume_username_auth_limit(
  p_key_hash text,
  p_limit integer default 5,
  p_window_seconds integer default 900
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.auth_rate_limits;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_limit > 20 or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'invalid rate-limit request' using errcode = '22023';
  end if;

  select * into v_row from public.auth_rate_limits where key_hash = p_key_hash for update;
  if not found then
    insert into public.auth_rate_limits(key_hash, window_started_at, attempts, updated_at)
    values (p_key_hash, now(), 1, now());
    return true;
  end if;

  if v_row.window_started_at + make_interval(secs => p_window_seconds) <= now() then
    update public.auth_rate_limits
      set window_started_at = now(), attempts = 1, updated_at = now()
      where key_hash = p_key_hash;
    return true;
  end if;

  if v_row.attempts >= p_limit then
    return false;
  end if;

  update public.auth_rate_limits
    set attempts = attempts + 1, updated_at = now()
    where key_hash = p_key_hash;
  return true;
end $$;

revoke all on function public.consume_username_auth_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_username_auth_limit(text,integer,integer) to service_role;
