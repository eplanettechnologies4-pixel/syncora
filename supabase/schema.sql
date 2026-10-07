create table products (
  id uuid primary key default gen_random_uuid(),
  shopify_product_id bigint unique,
  title text not null,
  vendor text,
  product_type text,
  status text default 'active',
  image_url text,
  price_min numeric(10,2),
  price_max numeric(10,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  shopify_variant_id bigint unique,
  sku text,
  title text,
  price numeric(10,2),
  created_at timestamptz default now()
);

create table inventory (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid references product_variants(id) on delete cascade,
  quantity int not null default 0,
  updated_at timestamptz default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  shopify_customer_id bigint unique,
  first_name text,
  last_name text,
  email text,
  created_at timestamptz default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id bigint unique,
  customer_id uuid references customers(id),
  order_number text,
  total_price numeric(10,2),
  financial_status text,
  fulfillment_status text,
  created_at timestamptz default now()
);

create table order_line_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  variant_id uuid references product_variants(id),
  quantity int not null,
  price numeric(10,2)
);
