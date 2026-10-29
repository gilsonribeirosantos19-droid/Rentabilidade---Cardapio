-- =====================================================================
-- ETIQUETAS · Cadastro de RESPONSÁVEIS (quem manipulou — vai no "RESP:")
-- Tabela nova + RLS por tenant. NÃO mexe em nada existente.
-- A RPC emitir_etiqueta JÁ aceita p_responsavel; o front passa o nome.
-- Rodar no SQL Editor — confira a ref trczpnjidqfippbfxtpe na URL.
-- =====================================================================

create table if not exists public.etiqueta_responsaveis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ix_etresp_tenant on public.etiqueta_responsaveis(tenant_id);

alter table public.etiqueta_responsaveis enable row level security;

drop policy if exists tenant_policy on public.etiqueta_responsaveis;
create policy tenant_policy on public.etiqueta_responsaveis for all
  using (tenant_id = get_my_tenant_id()) with check (tenant_id = get_my_tenant_id());

grant select, insert, update, delete on public.etiqueta_responsaveis to authenticated;
