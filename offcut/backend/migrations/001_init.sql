create table settings (
  id                int primary key default 1 check (id = 1),
  provider          text not null default 'demo',
  model             text not null default '',
  base_url          text not null default '',
  api_key_enc       bytea,
  stock_thicknesses jsonb not null default '[6, 9, 12, 15, 18, 25]',
  updated_at        timestamptz not null default now()
);
insert into settings (id) values (1);

create table projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  status       text not null default 'draft',
  pending      jsonb,
  conversation jsonb not null default '[]',
  reference    jsonb,
  notes        text not null default '',
  error        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table photos (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  view       text not null default '',
  media_type text not null,
  created_at timestamptz not null default now()
);
create index photos_project on photos (project_id, created_at);

-- Every analysis and every edit is a new version; nothing is overwritten.
create table spec_versions (
  project_id uuid not null references projects (id) on delete cascade,
  version    int not null,
  source     text not null,
  spec       jsonb not null,
  issues     jsonb not null default '[]',
  created_at timestamptz not null default now(),
  primary key (project_id, version)
);
