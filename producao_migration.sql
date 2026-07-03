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
