-- Índices para a função custo_medio_ate (C2) rodar rápido mesmo com muitas lojas / milhões de linhas.
--
-- A função filtra por (tenant_id, [loja_id], criado_em <= data) e ordena por (insumo_id, criado_em).
-- O índice (tenant_id, loja_id, insumo_id, criado_em) cobre o filtro E entrega as linhas já na ordem
-- da varredura (por loja) — sem precisar reordenar.
--
-- ⚠️ RODE CADA COMANDO SEPARADAMENTE (um de cada vez). "concurrently" NÃO pode rodar junto com
-- outros comandos numa mesma transação — mas em compensação NÃO trava as escritas da tabela
-- (seguro pra fazer com o sistema em produção). Cada um pode demorar um pouco em tabela grande.

create index concurrently if not exists idx_entradas_estoque_cmv
  on public.entradas_estoque (tenant_id, loja_id, insumo_id, criado_em);

create index concurrently if not exists idx_saidas_estoque_cmv
  on public.saidas_estoque (tenant_id, loja_id, insumo_id, criado_em);

-- ROLLBACK:
-- drop index if exists public.idx_entradas_estoque_cmv;
-- drop index if exists public.idx_saidas_estoque_cmv;
