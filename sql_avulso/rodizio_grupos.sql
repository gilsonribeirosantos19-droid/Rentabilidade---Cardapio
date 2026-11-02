-- =====================================================================
-- CADASTRO DE RODÍZIOS (Cadastros › Rodízios)
-- Liga a "cabeça" do rodízio (produto vendido com preço e SEM ficha, ex.: "070 - Rodízio de Sushi")
-- ao GRUPO DE LANÇAMENTO dos itens dele (ex.: "RODÍZIO DE SUSHIS", itens a R$0 COM ficha).
-- Custo do rodízio = tudo que foi lançado nos itens do grupo ÷ quantidade de rodízios do grupo.
-- Chave = código do PDV (muitas cabeças nem estão cadastradas em Produtos).
-- grupo = '' → "não é rodízio" (para o sistema parar de sugerir).
-- Rodar no SQL Editor — confira a ref trczpnjidqfippbfxtpe na URL.
-- =====================================================================
create table if not exists public.rodizio_grupos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  cabeca_codigo  text not null,          -- código do PDV da cabeça
  cabeca_nome    text,                   -- nome (só p/ exibir)
  grupo          text not null,          -- grupo de lançamento dos itens (MAIÚSCULO, como vem do PDV); '' = não é rodízio
  atualizado_em  timestamptz not null default now(),
  unique (tenant_id, cabeca_codigo)
);

alter table public.rodizio_grupos enable row level security;
drop policy if exists tenant_policy on public.rodizio_grupos;
create policy tenant_policy on public.rodizio_grupos for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());
grant select, insert, update, delete on public.rodizio_grupos to authenticated;
