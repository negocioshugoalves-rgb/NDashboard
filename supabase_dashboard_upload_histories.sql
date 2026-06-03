create table if not exists public.dashboard_upload_histories (
  key text primary key check (key ~ '^[a-zA-Z0-9_-]+$'),
  updated_at bigint not null default 0,
  history jsonb not null default '[]'::jsonb,
  saved_at timestamptz not null default now()
);

alter table public.dashboard_upload_histories enable row level security;

revoke all on table public.dashboard_upload_histories from anon;
revoke all on table public.dashboard_upload_histories from authenticated;
grant all on table public.dashboard_upload_histories to service_role;
