create extension if not exists pgcrypto;

create table if not exists public.user_entitlements (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null default 'app_access',
  status text not null default 'active' check (status in ('active', 'revoked')),
  hwid text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_entitlements_set_updated_at on public.user_entitlements;

create trigger user_entitlements_set_updated_at
before update on public.user_entitlements
for each row
execute function public.set_updated_at();

alter table public.user_entitlements enable row level security;
revoke all on table public.user_entitlements from public, anon, authenticated;

create or replace function public.authorize_app_access(p_hwid text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_entitlement public.user_entitlements%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if coalesce(trim(p_hwid), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_hwid');
  end if;

  select *
    into v_entitlement
  from public.user_entitlements
  where user_id = v_user_id
    and product_id = 'app_access'
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_purchase_access');
  end if;

  if v_entitlement.status <> 'active' then
    if v_entitlement.status = 'revoked' then
      return jsonb_build_object('ok', false, 'reason', 'revoked');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;

  if v_entitlement.hwid is null or btrim(v_entitlement.hwid) = '' then
    update public.user_entitlements
      set hwid = p_hwid
    where id = v_entitlement.id
    returning * into v_entitlement;
  elsif v_entitlement.hwid <> p_hwid then
    return jsonb_build_object('ok', false, 'reason', 'hwid_mismatch');
  end if;

  return jsonb_build_object(
    'ok', true,
    'reason', 'ok',
    'entitlement', jsonb_build_object(
      'id', v_entitlement.id,
      'product_id', v_entitlement.product_id,
      'status', v_entitlement.status
    )
  );
end;
$$;

create or replace function public.has_app_access()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select status
    into v_status
  from public.user_entitlements
  where user_id = v_user_id
    and product_id = 'app_access'
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_purchase_access');
  end if;

  if v_status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', v_status);
  end if;

  return jsonb_build_object('ok', true, 'reason', 'ok');
end;
$$;

revoke all on function public.authorize_app_access(text) from public, anon;
grant execute on function public.authorize_app_access(text) to authenticated;

revoke all on function public.has_app_access() from public, anon;
grant execute on function public.has_app_access() to authenticated;