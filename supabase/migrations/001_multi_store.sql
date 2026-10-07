-- ============================================================================
-- Migration: 001_multi_store.sql
-- Description: Multi-store schema migration introducing shops, shop_credentials,
--              user_shops, tenant-scoped shop_id columns, composite unique
--              constraints, performance indexes, and tenant Row Level Security.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: shops
--    Stores basic shop metadata. Access token is NOT stored here.
-- ----------------------------------------------------------------------------
create table if not exists shops (
  id uuid primary key default gen_random_uuid(),
  shop_domain text unique not null,
  scopes text,
  installed_at timestamptz default now(),
  uninstalled_at timestamptz
);


-- ----------------------------------------------------------------------------
-- 2. Table: shop_credentials
--    Stores sensitive shop access tokens.
--    RLS is enabled with NO policies so only the server's service role key
--    (which bypasses RLS) can read or write it.
-- ----------------------------------------------------------------------------
create table if not exists shop_credentials (
  shop_id uuid primary key references shops(id) on delete cascade,
  access_token text not null,
  updated_at timestamptz default now()
);

alter table shop_credentials enable row level security;
-- Intentionally NO policies created for shop_credentials.
-- Public anon / authenticated client roles cannot access this table.


-- ----------------------------------------------------------------------------
-- 3. Table: user_shops
--    Maps authenticated users to the shops they are permitted to access.
-- ----------------------------------------------------------------------------
create table if not exists user_shops (
  user_id uuid references auth.users(id) on delete cascade,
  shop_id uuid references shops(id) on delete cascade,
  role text not null default 'admin',
  primary key (user_id, shop_id)
);


-- ----------------------------------------------------------------------------
-- 4. Add shop_id column to all existing data tables
-- ----------------------------------------------------------------------------
alter table products
  add column if not exists shop_id uuid not null references shops(id) on delete cascade;

alter table product_variants
  add column if not exists shop_id uuid not null references shops(id) on delete cascade;

alter table inventory
  add column if not exists shop_id uuid not null references shops(id) on delete cascade;

alter table customers
  add column if not exists shop_id uuid not null references shops(id) on delete cascade;

alter table orders
  add column if not exists shop_id uuid not null references shops(id) on delete cascade;

alter table order_line_items
  add column if not exists shop_id uuid not null references shops(id) on delete cascade;

alter table manual_dispatches
  add column if not exists shop_id uuid not null references shops(id) on delete cascade;

alter table manual_dispatch_items
  add column if not exists shop_id uuid not null references shops(id) on delete cascade;


-- ----------------------------------------------------------------------------
-- 5. Replace single-column unique constraints with composite (shop_id, shopify_*_id)
--    and update inventory upsert key to (shop_id, variant_id)
-- ----------------------------------------------------------------------------
do $$
begin
  -- products: (shop_id, shopify_product_id)
  alter table products drop constraint if exists products_shopify_product_id_key;
  drop index if exists products_shopify_product_id_key;
  if not exists (
    select 1 from pg_constraint where conname = 'products_shop_id_shopify_product_id_key'
  ) then
    alter table products add constraint products_shop_id_shopify_product_id_key unique (shop_id, shopify_product_id);
  end if;

  -- product_variants: (shop_id, shopify_variant_id)
  alter table product_variants drop constraint if exists product_variants_shopify_variant_id_key;
  drop index if exists product_variants_shopify_variant_id_key;
  if not exists (
    select 1 from pg_constraint where conname = 'product_variants_shop_id_shopify_variant_id_key'
  ) then
    alter table product_variants add constraint product_variants_shop_id_shopify_variant_id_key unique (shop_id, shopify_variant_id);
  end if;

  -- customers: (shop_id, shopify_customer_id)
  alter table customers drop constraint if exists customers_shopify_customer_id_key;
  drop index if exists customers_shopify_customer_id_key;
  if not exists (
    select 1 from pg_constraint where conname = 'customers_shop_id_shopify_customer_id_key'
  ) then
    alter table customers add constraint customers_shop_id_shopify_customer_id_key unique (shop_id, shopify_customer_id);
  end if;

  -- orders: (shop_id, shopify_order_id)
  alter table orders drop constraint if exists orders_shopify_order_id_key;
  drop index if exists orders_shopify_order_id_key;
  if not exists (
    select 1 from pg_constraint where conname = 'orders_shop_id_shopify_order_id_key'
  ) then
    alter table orders add constraint orders_shop_id_shopify_order_id_key unique (shop_id, shopify_order_id);
  end if;

  -- inventory upsert key: (shop_id, variant_id)
  alter table inventory drop constraint if exists inventory_variant_id_key;
  drop index if exists inventory_variant_id_key;
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_shop_id_variant_id_key'
  ) then
    alter table inventory add constraint inventory_shop_id_variant_id_key unique (shop_id, variant_id);
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 6. Add indexes on shop_id for every table that has it
-- ----------------------------------------------------------------------------
create index if not exists user_shops_shop_id_idx on user_shops(shop_id);
create index if not exists products_shop_id_idx on products(shop_id);
create index if not exists product_variants_shop_id_idx on product_variants(shop_id);
create index if not exists inventory_shop_id_idx on inventory(shop_id);
create index if not exists customers_shop_id_idx on customers(shop_id);
create index if not exists orders_shop_id_idx on orders(shop_id);
create index if not exists order_line_items_shop_id_idx on order_line_items(shop_id);
create index if not exists manual_dispatches_shop_id_idx on manual_dispatches(shop_id);
create index if not exists manual_dispatch_items_shop_id_idx on manual_dispatch_items(shop_id);


-- ----------------------------------------------------------------------------
-- 7. Helper function for RLS to retrieve user's permitted shop IDs
--    Returns shop_id values from user_shops where user_id = auth.uid().
--    Marked SECURITY DEFINER with set search_path = public.
-- ----------------------------------------------------------------------------
create or replace function get_user_shop_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select shop_id from user_shops where user_id = auth.uid();
$$;


-- ----------------------------------------------------------------------------
-- 8. Enable Row Level Security and configure policies
-- ----------------------------------------------------------------------------

-- A. shops: allow select only for user's own shops
alter table shops enable row level security;

drop policy if exists "Users can view their own shops" on shops;
create policy "Users can view their own shops"
  on shops
  for select
  to authenticated
  using (id in (select get_user_shop_ids()));


-- B. user_shops: allow select only for rows where user_id = auth.uid()
--    No insert, update or delete policies
alter table user_shops enable row level security;

drop policy if exists "Users can view user_shops for their shops" on user_shops;
drop policy if exists "Users can manage user_shops for their shops" on user_shops;
drop policy if exists "Users can select own user_shops" on user_shops;

create policy "Users can select own user_shops"
  on user_shops
  for select
  to authenticated
  using (user_id = auth.uid());


-- C. Data tables: allow read and write (FOR ALL) only for user's own shops.
--    Every policy has both USING and WITH CHECK clauses.

-- products
alter table products enable row level security;
drop policy if exists "Users can access products for their shops" on products;
create policy "Users can access products for their shops"
  on products
  for all
  to authenticated
  using (shop_id in (select get_user_shop_ids()))
  with check (shop_id in (select get_user_shop_ids()));

-- product_variants
alter table product_variants enable row level security;
drop policy if exists "Users can access product_variants for their shops" on product_variants;
create policy "Users can access product_variants for their shops"
  on product_variants
  for all
  to authenticated
  using (shop_id in (select get_user_shop_ids()))
  with check (shop_id in (select get_user_shop_ids()));

-- inventory
alter table inventory enable row level security;
drop policy if exists "Users can access inventory for their shops" on inventory;
create policy "Users can access inventory for their shops"
  on inventory
  for all
  to authenticated
  using (shop_id in (select get_user_shop_ids()))
  with check (shop_id in (select get_user_shop_ids()));

-- customers
alter table customers enable row level security;
drop policy if exists "Users can access customers for their shops" on customers;
create policy "Users can access customers for their shops"
  on customers
  for all
  to authenticated
  using (shop_id in (select get_user_shop_ids()))
  with check (shop_id in (select get_user_shop_ids()));

-- orders
alter table orders enable row level security;
drop policy if exists "Users can access orders for their shops" on orders;
create policy "Users can access orders for their shops"
  on orders
  for all
  to authenticated
  using (shop_id in (select get_user_shop_ids()))
  with check (shop_id in (select get_user_shop_ids()));

-- order_line_items
alter table order_line_items enable row level security;
drop policy if exists "Users can access order_line_items for their shops" on order_line_items;
create policy "Users can access order_line_items for their shops"
  on order_line_items
  for all
  to authenticated
  using (shop_id in (select get_user_shop_ids()))
  with check (shop_id in (select get_user_shop_ids()));

-- manual_dispatches
alter table manual_dispatches enable row level security;
drop policy if exists "Users can access manual_dispatches for their shops" on manual_dispatches;
create policy "Users can access manual_dispatches for their shops"
  on manual_dispatches
  for all
  to authenticated
  using (shop_id in (select get_user_shop_ids()))
  with check (shop_id in (select get_user_shop_ids()));

-- manual_dispatch_items
alter table manual_dispatch_items enable row level security;
drop policy if exists "Users can access manual_dispatch_items for their shops" on manual_dispatch_items;
create policy "Users can access manual_dispatch_items for their shops"
  on manual_dispatch_items
  for all
  to authenticated
  using (shop_id in (select get_user_shop_ids()))
  with check (shop_id in (select get_user_shop_ids()));
