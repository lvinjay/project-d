-- Project D public selected-five publication
-- Stores the current exact selected-five manifest per normalized category key.
-- Direct client access stays blocked; server routes use the service-role client.

create table if not exists public.project_d_selected_five_publications (
  category_key text primary key,
  category text not null,
  manifest jsonb not null,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_d_selected_five_publications_category_nonempty
    check (length(btrim(category)) > 0),
  constraint project_d_selected_five_publications_manifest_object
    check (jsonb_typeof(manifest) = 'object')
);

alter table public.project_d_selected_five_publications
  enable row level security;

revoke all on table public.project_d_selected_five_publications
  from anon, authenticated;

grant select, insert, update, delete
  on table public.project_d_selected_five_publications
  to service_role;

create index if not exists
  project_d_selected_five_publications_category_idx
  on public.project_d_selected_five_publications (category);
