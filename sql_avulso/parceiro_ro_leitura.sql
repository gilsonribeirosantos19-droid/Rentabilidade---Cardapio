-- =====================================================================
-- ACESSO SÓ-LEITURA PARA O PARCEIRO (BI / dashboards / contabilidade) — v2 (schema próprio)
--  • login de banco parceiro_ro: só leitura, 5 conexões, consulta até 60s
--  • o parceiro NÃO lê as tabelas do app: lê o schema `parceiro`, com uma VIEW-espelho
--    de cada tabela JÁ FILTRADA pelos 3 tenants do dono (Sushi PN, Mori, Joya).
--    Testes e futuros clientes ficam de fora.
--  • por que views: as policies RLS do app usam auth.uid() (schema auth, que o
--    parceiro não pode acessar) → ler as tabelas direto dava "permission denied for schema auth".
--    As views rodam como o dono (postgres) e já trazem o filtro de tenant embutido.
--  • fora: usuários/login, segredos (ponte/sso), PIN dos operadores e backups
--  • o schema `parceiro` NÃO é exposto na API do app — só esse login enxerga.
-- Rodar no SQL Editor — confira a ref trczpnjidqfippbfxtpe na URL.
-- Tabela NOVA no app? rode este arquivo de novo (é idempotente).
-- =====================================================================

-- 0) desfaz a v1 (acesso direto às tabelas do app), se existir
do $$ declare r record; begin
  for r in select tablename from pg_policies where schemaname = 'public' and policyname = 'parceiro_ro_sel' loop
    execute format('drop policy parceiro_ro_sel on public.%I', r.tablename);
  end loop;
end $$;
revoke all on all tables in schema public from parceiro_ro;
revoke execute on function auth.uid(), auth.jwt(), auth.role() from parceiro_ro;
revoke usage on schema auth from parceiro_ro;

-- 1) o login (troque a senha na 1ª vez; se já existe, não mexe)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'parceiro_ro') then
    create role parceiro_ro login password 'TROQUE_POR_UMA_SENHA_FORTE';
  end if;
end $$;
alter role parceiro_ro set default_transaction_read_only = on;
alter role parceiro_ro set statement_timeout = '60s';
alter role parceiro_ro set search_path = parceiro;
alter role parceiro_ro connection limit 5;

-- 2) schema próprio + views filtradas
create schema if not exists parceiro;
revoke all on schema parceiro from public;
grant usage on schema parceiro to parceiro_ro;

do $$
declare
  r record;
  v_t text := quote_literal('{ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5,33e81daf-662f-43d1-8684-0702e959c4f9,a9b68882-5e10-4999-8fa9-4cf104625c0d}') || '::uuid[]';
begin
  -- tabelas com tenant_id
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p')
       and c.relname not in ('ponte_config','ponte_rotacao_log','sso_tokens','operadores','usuarios')
       and c.relname not like '\_bkp%'
       and exists (select 1 from information_schema.columns col
                    where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'tenant_id')
  loop
    execute format('drop view if exists parceiro.%I', r.relname);
    execute format('create view parceiro.%I as select * from public.%I where tenant_id = any (%s)', r.relname, r.relname, v_t);
  end loop;

  -- itens filhos (sem tenant_id): filtro pela tabela "mãe"
  drop view if exists parceiro.itens_ficha;
  execute format('create view parceiro.itens_ficha as select i.* from public.itens_ficha i
                   join public.fichas_tecnicas f on f.id = i.ficha_id where f.tenant_id = any (%s)', v_t);
  drop view if exists parceiro.itens_pedido;
  execute format('create view parceiro.itens_pedido as select i.* from public.itens_pedido i
                   join public.pedidos_compra p on p.id = i.pedido_id where p.tenant_id = any (%s)', v_t);
  drop view if exists parceiro.perdas_itens;
  execute format('create view parceiro.perdas_itens as select i.* from public.perdas_itens i
                   join public.perdas p on p.id = i.perda_id where p.tenant_id = any (%s)', v_t);
  drop view if exists parceiro.tenants;
  execute format('create view parceiro.tenants as select * from public.tenants where id = any (%s)', v_t);
  -- textos gerais do sistema (sem dado de cliente)
  drop view if exists parceiro.ajuda_artigos;
  create view parceiro.ajuda_artigos as select * from public.ajuda_artigos;
  drop view if exists parceiro.changelog;
  create view parceiro.changelog as select * from public.changelog;
end $$;

grant select on all tables in schema parceiro to parceiro_ro;

-- 3) conferência (roda como você mesmo — não precisa "vestir" o parceiro)
--    a) tem que mostrar SÓ os 3 tenants (nunca 00000000-...-0001):
select tenant_id, count(*) from parceiro.fichas_tecnicas group by 1;
--    b) o parceiro NÃO lê as tabelas do app nem o login (tudo false):
-- select has_table_privilege('parceiro_ro','public.fichas_tecnicas','select') as app,
--        has_table_privilege('parceiro_ro','public.usuarios','select')        as usuarios,
--        has_table_privilege('parceiro_ro','auth.users','select')             as logins;

-- ---------------------------------------------------------------------
-- DESLIGAR o acesso (a qualquer momento):   alter role parceiro_ro nologin;
-- REMOVER de vez:
--   drop schema parceiro cascade;
--   drop role parceiro_ro;
-- ---------------------------------------------------------------------
