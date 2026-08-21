create table if not exists public.official_site_mappings (
  brand_key text primary key,
  brand_name text not null default '',
  official_site text not null,
  source text not null default 'search',
  confidence integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists
  official_site_mappings_official_site_idx
on public.official_site_mappings (
  official_site
);

comment on table public.official_site_mappings is
  'Project D 브랜드별 제조사/본사 공식 사이트 학습 매핑';

comment on column public.official_site_mappings.brand_key is
  '정규화된 브랜드 식별키';

comment on column public.official_site_mappings.official_site is
  '제조사 또는 브랜드 본사 공식 사이트 루트 URL';
