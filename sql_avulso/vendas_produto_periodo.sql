-- =====================================================================
-- RPC vendas_produto_periodo — soma as vendas por loja × produto num período,
-- só nos dias com recebimento 'processado' (mesmo portão do Faturamento/Engenharia).
-- Usada pelo relatório Gestão › Impacto na Margem p/ períodos longos (trimestre/semestre/ano):
-- em vez de baixar dia a dia (centenas de milhares de linhas), o banco já devolve somado.
-- Só leitura · respeita o tenant do usuário (security invoker + RLS).
-- Rodar no SQL Editor — confira a ref trczpnjidqfippbfxtpe na URL.
-- =====================================================================
create or replace function public.vendas_produto_periodo(p_ini date, p_fim date)
returns table (loja_id uuid, produto_id text, produto_nome text, grupo text, qtd numeric, faturado numeric)
language sql stable security invoker set search_path = public as $$
  select v.loja_id, v.produto_id::text, max(v.produto_nome)::text, max(v.grupo)::text,
         sum(coalesce(v.qtd, 0))::numeric, sum(coalesce(v.faturado, 0))::numeric
    from public.vendas_produto_dia v
   where v.tenant_id = get_my_tenant_id()
     and v.data between p_ini and p_fim
     and exists (select 1 from public.recebimento_vendas r
                  where r.tenant_id = v.tenant_id and r.loja_id = v.loja_id
                    and r.data = v.data and r.status = 'processado')
   group by v.loja_id, v.produto_id
$$;
grant execute on function public.vendas_produto_periodo(date, date) to authenticated;
