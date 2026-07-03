-- ============================================================
-- DIAGNÓSTICO: nota da MARFOOD que entrou como "Bomba Tare" (SPN)
-- SÓ LEITURA — não altera nada. Rode no Supabase > SQL Editor.
-- Tenant SPN: ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5
-- ============================================================

-- A) A(s) nota(s) da MARFOOD que chegaram no Monitor
select id, numero, serie, cnpj_emitente, nome_emitente,
       valor_total, status, fonte, data_emissao
from nfe_recebidas
where tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and nome_emitente ilike '%MARFOOD%'
order by data_emissao desc;

-- B) Os ITENS dessa nota e COMO foram vinculados (o "de-para" que a jogou em Bomba Tare)
select n.numero, n.serie,
       ni.descricao_nfe, ni.codigo_item_fornecedor as cod_forn,
       ni.quantidade, ni.unidade_nfe, ni.valor_unitario,
       ni.vinculacao_id,
       ifv.insumo_id, i.nome as item_interno,
       ifv.codigo_fornecedor as cod_no_vinculo,
       ifv.qtd_por_embalagem as fator, ifv.embalagem_descricao
from nfe_itens ni
join nfe_recebidas n on n.id = ni.nfe_id
left join insumo_fornecedores ifv on ifv.id = ni.vinculacao_id
left join insumos i on i.id = ifv.insumo_id
where n.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and n.nome_emitente ilike '%MARFOOD%';

-- C) As ENTRADAS de estoque geradas por essa nota (o que virou saldo)
select e.nfe_numero, l.nome as loja, i.nome as item,
       e.quantidade, e.unidade_compra, e.custo_unitario, e.custo_total, e.criado_em
from entradas_estoque e
left join insumos i on i.id = e.insumo_id
left join lojas l on l.id = e.loja_id
where e.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and (e.nfe_numero like '240/%')
order by e.criado_em;

-- D) O VÍNCULO culpado: quais de-para apontam para "Bomba Tare" e com qual código
--    (mostra se o código do fornecedor é genérico demais — ex.: "3")
select ifv.id, ifv.fornecedor_id, ifv.codigo_fornecedor, ifv.descricao_fornecedor,
       ifv.qtd_por_embalagem as fator, ifv.embalagem_descricao, i.nome as item_interno
from insumo_fornecedores ifv
join insumos i on i.id = ifv.insumo_id
where ifv.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and i.nome ilike '%bomba tare%';

-- E) (opcional) de-para por DESCRIÇÃO na vinculos_nfe apontando pra Bomba Tare
select v.descricao_nfe, v.codigo_nfe, v.fator_conversao, i.nome as item_interno
from vinculos_nfe v
join insumos i on i.id = v.insumo_id
where v.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and i.nome ilike '%bomba tare%';
