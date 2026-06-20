-- ============================================================================
-- comparativo_lojas(p_tenant, p_inicio)
-- Soma NO SERVIDOR os totais por loja do mês (não estoura o limite de 1000
-- linhas do PostgREST — escala com qualquer volume de entradas/saídas).
-- Usado pelo Comparativo por Loja do dashboard.
-- Rodar no Supabase > SQL Editor.
-- ============================================================================
create or replace function public.comparativo_lojas(p_tenant uuid, p_inicio timestamptz)
returns table(
  loja_id uuid,
  valor_estoque numeric,
  compras_mes numeric,
  perdas_mes numeric,
  consumo_mes numeric,
  fat_mes numeric,
  inv_ativos int,
  inv_total int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.id,
    coalesce((select sum(s.quantidade * s.custo_medio)
              from saldo_estoque s
              where s.tenant_id = p_tenant and s.loja_id = l.id), 0),
    coalesce((select sum(e.custo_total)
              from entradas_estoque e
              where e.tenant_id = p_tenant and e.loja_id = l.id and e.criado_em >= p_inicio), 0),
    coalesce((select sum(sa.quantidade * coalesce(sl.custo_medio, 0))
              from saidas_estoque sa
              left join saldo_estoque sl on sl.tenant_id = p_tenant and sl.insumo_id = sa.insumo_id and sl.loja_id = l.id
              where sa.tenant_id = p_tenant and sa.loja_id = l.id
                and sa.tipo in ('perda','vencimento','descarte') and sa.criado_em >= p_inicio), 0),
    coalesce((select sum(sa.quantidade * coalesce(sl.custo_medio, 0))
              from saidas_estoque sa
              left join saldo_estoque sl on sl.tenant_id = p_tenant and sl.insumo_id = sa.insumo_id and sl.loja_id = l.id
              where sa.tenant_id = p_tenant and sa.loja_id = l.id
                and sa.tipo = 'consumo' and sa.criado_em >= p_inicio), 0),
    coalesce((select sum(f.valor)
              from faturamentos f
              where f.tenant_id = p_tenant and f.loja_id = l.id and f.data >= p_inicio::date), 0),
    coalesce((select count(*) from inventarios i where i.tenant_id = p_tenant and i.loja_id = l.id and i.status = 'ativo'), 0)::int,
    coalesce((select count(*) from inventarios i where i.tenant_id = p_tenant and i.loja_id = l.id), 0)::int
  from lojas l
  where l.tenant_id = p_tenant
  order by l.nome;
$$;

grant execute on function public.comparativo_lojas(uuid, timestamptz) to authenticated;
