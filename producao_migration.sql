-- ============================================================
-- Módulo Produção (PCP) — tabelas base
-- Rodar UMA vez no Supabase → SQL Editor.
-- RLS padrão do projeto: tenant_policy usando get_my_tenant_id().
-- ============================================================

-- ---- SETORES DE PRODUÇÃO ----
create table if not exists setores_producao (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  nome        text not null,
  responsavel text,
  ativo       boolean default true,
  created_at  timestamptz default now()
);
alter table setores_producao enable row level security;
drop policy if exists tenant_policy on setores_producao;
create policy tenant_policy on setores_producao for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
grant all on setores_producao to anon, authenticated;

-- ---- ITEM DE PORCIONAMENTO (cabeçalho: 1 insumo original) ----
create table if not exists itens_porcionamento (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  insumo_id   uuid not null,            -- item original (matéria-prima), FK lógica -> insumos
  setor_id    uuid,                     -- -> setores_producao
  perda_pct   numeric(6,3) default 0,   -- perda esperada (%)
  ativo       boolean default true,
  created_at  timestamptz default now()
);
alter table itens_porcionamento enable row level security;
drop policy if exists tenant_policy on itens_porcionamento;
create policy tenant_policy on itens_porcionamento for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
grant all on itens_porcionamento to anon, authenticated;

-- ---- DERIVADOS de um item de porcionamento ----
create table if not exists itens_porcionamento_derivados (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null,
  item_porcionamento_id  uuid not null references itens_porcionamento(id) on delete cascade,
  insumo_id              uuid not null,           -- derivado (também insumo cadastrado)
  rendimento_pct         numeric(6,3) default 0,  -- % de rendimento do derivado
  ativo                  boolean default true
);
alter table itens_porcionamento_derivados enable row level security;
drop policy if exists tenant_policy on itens_porcionamento_derivados;
create policy tenant_policy on itens_porcionamento_derivados for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
grant all on itens_porcionamento_derivados to anon, authenticated;

-- ============================================================
-- ORDENS DE PORCIONAMENTO (apontamento — Portal do Gerente)
-- ============================================================
create table if not exists ordens_porcionamento (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  loja_id     uuid,
  data        timestamptz default now(),
  insumo_id   uuid not null,          -- item original porcionado
  quantidade  numeric(14,4) default 0,
  peso        numeric(14,4) default 0,
  peso_medio  numeric(14,4) default 0,
  status      text default 'aberta',  -- aberta | finalizada
  observacao  text,
  created_at  timestamptz default now()
);
alter table ordens_porcionamento enable row level security;
drop policy if exists tenant_policy on ordens_porcionamento;
create policy tenant_policy on ordens_porcionamento for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
grant all on ordens_porcionamento to anon, authenticated;

create table if not exists ordens_porcionamento_itens (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  ordem_id    uuid not null references ordens_porcionamento(id) on delete cascade,
  insumo_id   uuid not null,          -- derivado
  quantidade  numeric(14,4) default 0,
  peso        numeric(14,4) default 0,
  peso_medio  numeric(14,4) default 0
);
alter table ordens_porcionamento_itens enable row level security;
drop policy if exists tenant_policy on ordens_porcionamento_itens;
create policy tenant_policy on ordens_porcionamento_itens for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
grant all on ordens_porcionamento_itens to anon, authenticated;

-- ============================================================
-- ORDENS DE PRODUÇÃO (item com ficha técnica)
-- ============================================================
create table if not exists ordens_producao (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  loja_id             uuid,
  data                timestamptz default now(),
  ficha_id            uuid not null,
  insumo_produzido_id uuid,
  quantidade          numeric(14,4) default 0,
  custo_total         numeric(14,4) default 0,
  status              text default 'aberta',
  observacao          text,
  created_at          timestamptz default now()
);
alter table ordens_producao enable row level security;
drop policy if exists tenant_policy on ordens_producao;
create policy tenant_policy on ordens_producao for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
grant all on ordens_producao to anon, authenticated;

create table if not exists ordens_producao_itens (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  ordem_id    uuid not null references ordens_producao(id) on delete cascade,
  insumo_id   uuid not null,
  quantidade  numeric(14,4) default 0,
  custo       numeric(14,4) default 0
);
alter table ordens_producao_itens enable row level security;
drop policy if exists tenant_policy on ordens_producao_itens;
create policy tenant_policy on ordens_producao_itens for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
grant all on ordens_producao_itens to anon, authenticated;
