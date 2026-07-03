-- ============================================================
-- CAÇA-ERROS LEGADO: itens vinculados a um fornecedor de CNPJ
-- DIFERENTE do emitente da nota (casamento por código sem CNPJ,
-- de antes da correção). SÓ LEITURA — não altera nada.
-- Tenant SPN: ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5
-- ============================================================

-- 1) A LISTA dos casos (o item ligou num vínculo de OUTRO fornecedor)
select
  n.status,
  n.numero, n.serie,
  n.nome_emitente,                        -- quem EMITIU a nota
  n.cnpj_emitente as cnpj_nota,
  ni.descricao_nfe,                       -- o que era o item de verdade
  ni.codigo_item_fornecedor as cod,
  i.nome as item_que_ligou,               -- o insumo em que caiu (ERRADO)
  f.nome as fornecedor_do_vinculo,        -- dono do vínculo (o certo p/ esse item)
  f.cnpj as cnpj_do_vinculo
from nfe_itens ni
join nfe_recebidas n       on n.id  = ni.nfe_id
join insumo_fornecedores ifv on ifv.id = ni.vinculacao_id
join fornecedores f        on f.id  = ifv.fornecedor_id
left join insumos i        on i.id  = ifv.insumo_id
where n.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and regexp_replace(coalesce(f.cnpj,''),        '[^0-9]', '', 'g')
   <> regexp_replace(coalesce(n.cnpj_emitente,''),'[^0-9]', '', 'g')
order by
  case n.status when 'processada' then 0 else 1 end,   -- processadas primeiro (essas mexeram no estoque)
  n.data_emissao desc;

-- 2) RESUMO: quantos casos, e quantos JÁ ENTRARAM no estoque (status processada)
select
  count(*)                                        as total_casos,
  count(*) filter (where n.status = 'processada') as ja_processadas   -- essas precisam de estorno
from nfe_itens ni
join nfe_recebidas n       on n.id  = ni.nfe_id
join insumo_fornecedores ifv on ifv.id = ni.vinculacao_id
join fornecedores f        on f.id  = ifv.fornecedor_id
where n.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and regexp_replace(coalesce(f.cnpj,''),        '[^0-9]', '', 'g')
   <> regexp_replace(coalesce(n.cnpj_emitente,''),'[^0-9]', '', 'g');

-- ============================================================
-- Dica: pra checar TODOS os clientes de uma vez (não só o SPN),
-- é só APAGAR as duas linhas "n.tenant_id = '...'" das duas consultas.
-- ============================================================
