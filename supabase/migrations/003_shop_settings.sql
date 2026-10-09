-- ============================================================================
-- Migration: 003_shop_settings.sql
-- Description: Create shop_settings table with per-shop tenant scoping and RLS
-- ============================================================================

create table if not exists shop_settings (
  shop_id uuid primary key references shops(id) on delete cascade,
  business_name text,
  website text,
  address text,
  phone text,
  email text,
  currency_label text default 'Rs',
  challan_footer text,
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table shop_settings enable row level security;

-- Policy: Members of the shop can select
drop policy if exists "Members of the shop can select shop_settings" on shop_settings;
create policy "Members of the shop can select shop_settings"
  on shop_settings
  for select
  to authenticated
  using (
    exists (
      select 1
      from user_shops
      where user_shops.shop_id = shop_settings.shop_id
        and user_shops.user_id = auth.uid()
    )
  );

-- Policy: Only users whose user_shops role is 'owner' for that shop can insert
drop policy if exists "Owners can insert shop_settings" on shop_settings;
create policy "Owners can insert shop_settings"
  on shop_settings
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from user_shops
      where user_shops.shop_id = shop_settings.shop_id
        and user_shops.user_id = auth.uid()
        and user_shops.role = 'owner'
    )
  );

-- Policy: Only users whose user_shops role is 'owner' for that shop can update
drop policy if exists "Owners can update shop_settings" on shop_settings;
create policy "Owners can update shop_settings"
  on shop_settings
  for update
  to authenticated
  using (
    exists (
      select 1
      from user_shops
      where user_shops.shop_id = shop_settings.shop_id
        and user_shops.user_id = auth.uid()
        and user_shops.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from user_shops
      where user_shops.shop_id = shop_settings.shop_id
        and user_shops.user_id = auth.uid()
        and user_shops.role = 'owner'
    )
  );
