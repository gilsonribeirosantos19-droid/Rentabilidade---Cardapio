-- ═══════════════════════════════════════════════════════════════════
-- PCP — tabelas Calendário de Produção + Atividades
-- Rodar no Supabase → SQL Editor (autocommit). RLS padrão do projeto.
-- ═══════════════════════════════════════════════════════════════════

-- Calendário: por item produzível (insumo), em quais dias da semana se produz
create table if not exists public.calendario_producao (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  insumo_id  uuid not null,
  seg boolean not null default false,
  ter boolean not null default false,
  qua boolean not null default false,
  qui boolean not null default false,
  sex boolean not null default false,
  sab boolean not null default false,
  dom boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, insumo_id)
);
alter table public.calendario_producao enable row level security;
drop policy if exists tenant_policy on public.calendario_producao;
create policy tenant_policy on public.calendario_producao for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
grant all on public.calendario_producao to anon, authenticated;

-- Atividades: etapas/checklist por item produzível
create table if not exists public.atividades_producao (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  insumo_id  uuid not null,
  ordem      integer not null default 1,
  descricao  text not null,
  tempo_min  numeric,
  created_at timestamptz not null default now()
);
alter table public.atividades_producao enable row level security;
drop policy if exists tenant_policy on public.atividades_producao;
create policy tenant_policy on public.atividades_producao for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
grant all on public.atividades_producao to anon, authenticated;
create index if not exists ix_atividades_prod_insumo on public.atividades_producao (tenant_id, insumo_id, ordem);
