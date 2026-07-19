-- ============================================================
-- FASE 1 — Vendas de produto POR DIA (fundação p/ produção diária)
-- Guarda: loja · dia · produto · quantidade · faturado.
-- Aditiva: NÃO mexe em icomanda_vendas (mensal), portão, nem no resto.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.icomanda_vendas_dia (
  tenant_id     uuid    not null,
  loja_id       uuid    not null,
  data          date    not null,
  produto_id    bigint  not null,
  produto_nome  text,
  grupo         text,
  qtd           numeric not null default 0,
  faturado      numeric not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, loja_id, data, produto_id)
);

-- índice p/ filtrar por período (tenant + intervalo de datas, todas as lojas)
create index if not exists idx_icv_dia_tenant_data on public.icomanda_vendas_dia (tenant_id, data);

-- RLS: cada tenant só vê o seu. O robô (Edge Function) grava via service role, que ignora o RLS.
alter table public.icomanda_vendas_dia enable row level security;

drop policy if exists tenant_policy on public.icomanda_vendas_dia;
create policy tenant_policy on public.icomanda_vendas_dia
  for all
  using (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

grant select, insert, update, delete on public.icomanda_vendas_dia to anon, authenticated;
