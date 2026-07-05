-- ============================================================================
-- RLS do módulo Fiscal (NF-e) — isolamento por tenant
-- Padrão do projeto: tenant_policy FOR ALL usando get_my_tenant_id()
-- (mesma regra das demais tabelas: USING + WITH CHECK).
--
-- Por que: as tabelas nfe_recebidas / nfe_itens / nfe_log não tinham RLS
-- versionada no repositório. Sem RLS ativa, o isolamento entre clientes
-- dependia só do filtro .eq('tenant_id', ...) do app. Esta migração fecha isso
-- no banco — e é PRÉ-REQUISITO pra blindagem do nfe-webhook (o modo
-- "completa/danfe" confia na RLS pra confirmar que a chave é do tenant do usuário).
--
-- Rodar este arquivo inteiro no Supabase -> SQL Editor. Idempotente.
-- ============================================================================

alter table public.nfe_recebidas enable row level security;
alter table public.nfe_itens     enable row level security;
alter table public.nfe_log       enable row level security;

drop policy if exists tenant_policy on public.nfe_recebidas;
create policy tenant_policy on public.nfe_recebidas
  for all
  using      (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

drop policy if exists tenant_policy on public.nfe_itens;
create policy tenant_policy on public.nfe_itens
  for all
  using      (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

drop policy if exists tenant_policy on public.nfe_log;
create policy tenant_policy on public.nfe_log
  for all
  using      (tenant_id = get_my_tenant_id())
  with check (tenant_id = get_my_tenant_id());

grant select, insert, update, delete on public.nfe_recebidas to anon, authenticated;
grant select, insert, update, delete on public.nfe_itens     to anon, authenticated;
grant select, insert, update, delete on public.nfe_log       to anon, authenticated;

-- Conferência (deve listar rowsecurity = true nas três):
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename like 'nfe%';
--
-- OBS: o nfe-webhook e as funções de cron usam a SERVICE_ROLE_KEY (server-side),
-- que ignora RLS de propósito — elas continuam gravando normalmente.
