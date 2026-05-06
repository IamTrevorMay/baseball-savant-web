-- Email system tables
-- Run against Supabase SQL editor

-- 1. email_products — top-level entity (one per email brand)
create table if not exists email_products (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  name        text not null,
  slug        text not null unique,
  product_type text not null default 'recurring' check (product_type in ('recurring', 'campaign')),
  branding    jsonb not null default '{}'::jsonb,
  schedule    jsonb,
  landing_enabled boolean not null default false,
  landing_config  jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_email_products_slug on email_products(slug);

-- 2. email_templates — versioned block layouts per product
create table if not exists email_templates (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references email_products(id) on delete cascade,
  name            text not null default 'Default',
  version         int not null default 1,
  is_active       boolean not null default true,
  blocks          jsonb not null default '[]'::jsonb,
  settings        jsonb not null default '{"maxWidth":640,"bodyBg":"#09090b","contentBg":"#09090b","fontFamily":"sans-serif"}'::jsonb,
  subject_template text not null default '{{title}} — {{date_short}}',
  preheader_template text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_email_templates_product on email_templates(product_id);

-- 3. email_sends — record of every dispatch
create table if not exists email_sends (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references email_products(id) on delete cascade,
  template_id     uuid references email_templates(id) on delete set null,
  send_type       text not null default 'recurring' check (send_type in ('recurring', 'campaign', 'test')),
  subject         text not null default '',
  date            date,
  rendered_html   text,
  recipient_count int not null default 0,
  delivered_count int not null default 0,
  opened_count    int not null default 0,
  clicked_count   int not null default 0,
  bounced_count   int not null default 0,
  audience_ids    uuid[] not null default '{}',
  status          text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'failed')),
  sent_at         timestamptz,
  error           text,
  created_at      timestamptz not null default now()
);

create index idx_email_sends_product on email_sends(product_id);
create unique index idx_email_sends_idempotent on email_sends(product_id, date) where send_type = 'recurring' and status = 'sent';

-- 4. email_audiences — subscriber lists
create table if not exists email_audiences (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  product_id      uuid references email_products(id) on delete set null,
  source          text not null default 'manual',
  subscriber_count int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_email_audiences_product on email_audiences(product_id);

-- 5. email_subscribers — individual subscribers (encrypted PII)
create table if not exists email_subscribers (
  id              uuid primary key default gen_random_uuid(),
  encrypted_email text not null,
  email_hash      text not null unique,
  encrypted_name  text,
  source          text not null default 'api',
  metadata        jsonb not null default '{}'::jsonb,
  unsubscribe_token text not null default encode(gen_random_bytes(32), 'hex'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_email_subscribers_hash on email_subscribers(email_hash);
create index idx_email_subscribers_token on email_subscribers(unsubscribe_token);

-- 6. email_audience_members — many-to-many junction
create table if not exists email_audience_members (
  audience_id     uuid not null references email_audiences(id) on delete cascade,
  subscriber_id   uuid not null references email_subscribers(id) on delete cascade,
  is_active       boolean not null default true,
  subscribed_at   timestamptz not null default now(),
  unsubscribed_at timestamptz,
  primary key (audience_id, subscriber_id)
);

create index idx_email_audience_members_sub on email_audience_members(subscriber_id);

-- 7. email_events — per-recipient tracking
create table if not exists email_events (
  id              uuid primary key default gen_random_uuid(),
  send_id         uuid not null references email_sends(id) on delete cascade,
  subscriber_id   uuid references email_subscribers(id) on delete set null,
  event_type      text not null check (event_type in ('open', 'click', 'bounce', 'complaint', 'delivered')),
  link_url        text,
  link_label      text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index idx_email_events_send on email_events(send_id);
create index idx_email_events_sub on email_events(subscriber_id);
create index idx_email_events_type on email_events(event_type);

-- 8. email_blocks_library — saved reusable block snippets
create table if not exists email_blocks_library (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  name            text not null,
  category        text not null default 'custom',
  block_config    jsonb not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_email_blocks_library_user on email_blocks_library(user_id);

-- 9. Helper RPC: atomic counter increment for email_sends
create or replace function increment_email_send_counter(p_send_id uuid, p_column text)
returns void language plpgsql security definer as $$
begin
  execute format(
    'update email_sends set %I = %I + 1 where id = $1',
    p_column, p_column
  ) using p_send_id;
end;
$$;

-- RLS policies
alter table email_products enable row level security;
alter table email_templates enable row level security;
alter table email_sends enable row level security;
alter table email_audiences enable row level security;
alter table email_subscribers enable row level security;
alter table email_audience_members enable row level security;
alter table email_events enable row level security;
alter table email_blocks_library enable row level security;

-- Admin-only policies (owner/admin roles)
create policy "email_products_admin" on email_products for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('owner', 'admin')
    )
  );

create policy "email_templates_admin" on email_templates for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('owner', 'admin')
    )
  );

create policy "email_sends_admin" on email_sends for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('owner', 'admin')
    )
  );

create policy "email_audiences_admin" on email_audiences for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('owner', 'admin')
    )
  );

create policy "email_subscribers_admin" on email_subscribers for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('owner', 'admin')
    )
  );

create policy "email_audience_members_admin" on email_audience_members for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('owner', 'admin')
    )
  );

create policy "email_events_admin" on email_events for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('owner', 'admin')
    )
  );

create policy "email_blocks_library_admin" on email_blocks_library for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('owner', 'admin')
    )
  );
