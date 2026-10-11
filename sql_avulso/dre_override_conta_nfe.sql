-- ============================================================================
-- DRE — OVERRIDE de conta gerencial por item da NF-e ("Apropriação")
-- Cada item já herda a conta do insumo (cadastro). O override troca a conta
-- SÓ naquela nota, sem mexer no cadastro.
--
-- Como funciona:
--   nfe_itens.conta_gerencial_id      = override escolhido na aba Apropriação (null = herda do insumo)
--   entradas_estoque.conta_gerencial_id = override "congelado" na entrada (null = herda do insumo)
--   DRE usa: coalesce(entrada.conta, insumo.conta)  ← conta EFETIVA
--
-- NÃO toca na RPC do coração (registrar_entrada_estoque): a entrada é criada
-- normal e o override é gravado num UPDATE separado logo depois (no app).
-- Idempotente.
-- ============================================================================

alter table public.nfe_itens        add column if not exists conta_gerencial_id uuid;
alter table public.entradas_estoque  add column if not exists conta_gerencial_id uuid;

-- DRE: soma por insumo × CONTA EFETIVA × mês (no servidor).
-- Retorna também a conta_gerencial_id (efetiva) p/ a tela montar a árvore.
create or replace function public.dre_compras_mensal(p_ano int, p_loja uuid default null)
returns table (insumo_id uuid, conta_gerencial_id uuid, mes int, total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select ee.insumo_id,
         coalesce(ee.conta_gerencial_id, i.conta_gerencial_id)                   as conta_gerencial_id,
         extract(month from (ee.criado_em at time zone 'America/Sao_Paulo'))::int as mes,
         sum(ee.custo_total)                                                      as total
  from entradas_estoque ee
  left join insumos i on i.id = ee.insumo_id and i.tenant_id = ee.tenant_id
  where ee.tenant_id = get_my_tenant_id()
    and ee.tipo in ('manual', 'nfe', 'nfe_importada')
    and ee.criado_em >= (make_timestamp(p_ano, 1, 1, 0, 0, 0)     at time zone 'America/Sao_Paulo')
    and ee.criado_em <  (make_timestamp(p_ano + 1, 1, 1, 0, 0, 0) at time zone 'America/Sao_Paulo')
    and (p_loja is null or ee.loja_id = p_loja)
  group by ee.insumo_id, coalesce(ee.conta_gerencial_id, i.conta_gerencial_id),
           extract(month from (ee.criado_em at time zone 'America/Sao_Paulo'));
$$;

grant execute on function public.dre_compras_mensal(int, uuid) to anon, authenticated;
