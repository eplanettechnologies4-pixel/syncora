-- ============================================================================
-- Migration: 000_missing_tables.sql
-- Description: Creates all tables, columns, and constraints used by the
--              application codebase (app/, lib/, middleware.ts) that are
--              not defined in supabase/schema.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extra columns on existing "customers" table
--    Used in app/api/sync-orders/route.ts, app/api/webhooks/orders/route.ts,
--    app/dashboard/customers/page.tsx, and components/customers/CustomersView.tsx
-- ----------------------------------------------------------------------------
alter table if exists customers
  add column if not exists phone text,
  add column if not exists total_orders integer not null default 0,
  add column if not exists total_spent numeric(10,2) not null default 0.00;

-- Index to optimize sorting customers by lifetime spend
create index if not exists customers_total_spent_idx on customers(total_spent desc);


-- ----------------------------------------------------------------------------
-- 2. Unique constraint/index on existing "inventory" table
--    Required for upsert onConflict: "variant_id" used in:
--    app/api/sync-inventory/route.ts, app/api/webhooks/products/route.ts,
--    and app/api/webhooks/inventory/route.ts
-- ----------------------------------------------------------------------------
create unique index if not exists inventory_variant_id_key on inventory(variant_id);


-- ----------------------------------------------------------------------------
-- 3. Table: "manual_dispatches"
--    Used for manual warehouse dispatches in app/api/dispatch/route.ts,
--    app/api/dispatch/payment-status/route.ts, app/api/dispatch/print-status/route.ts,
--    and app/dashboard/dispatch/*
-- ----------------------------------------------------------------------------
create table if not exists manual_dispatches (
  id uuid primary key default gen_random_uuid(),
  recipient_name text not null,
  notes text,
  total_quantity integer not null default 0,
  created_at timestamptz default now()
);

-- Index for ordering dispatches by creation date
create index if not exists manual_dispatches_created_at_idx on manual_dispatches(created_at desc);


-- ----------------------------------------------------------------------------
-- 4. Table: "manual_dispatch_items"
--    Used for line items in manual warehouse stock deductions in
--    app/api/dispatch/route.ts and app/dashboard/dispatch/[id]/*
-- ----------------------------------------------------------------------------
create table if not exists manual_dispatch_items (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid references manual_dispatches(id) on delete cascade,
  variant_id uuid references product_variants(id),
  quantity integer not null default 1,
  quantity_before integer,
  quantity_after integer,
  created_at timestamptz default now()
);

-- Indexes for foreign key lookups and deletes
create index if not exists manual_dispatch_items_dispatch_id_idx on manual_dispatch_items(dispatch_id);
create index if not exists manual_dispatch_items_variant_id_idx on manual_dispatch_items(variant_id);


-- ----------------------------------------------------------------------------
-- 5. Table: "user_roles"
--    Queried in middleware.ts:49 to enforce administrator privileges
--    (role === 'admin') before granting access to /dashboard routes
-- ----------------------------------------------------------------------------
create table if not exists user_roles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS) on user_roles
alter table user_roles enable row level security;

-- Policy to allow authenticated users to read their own role record,
-- which allows the Supabase client in middleware.ts to verify the user's role
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'Allow authenticated users to read own role'
  ) then
    create policy "Allow authenticated users to read own role"
      on user_roles
      for select
      to authenticated
      using (auth.uid() = id);
  end if;
end $$;
