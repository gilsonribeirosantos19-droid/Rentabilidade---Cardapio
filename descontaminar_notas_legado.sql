-- ============================================================
-- DESCONTAMINAR as notas legadas (Alain Pinheiro + M F Embalagens):
-- tira o vínculo ERRADO dos itens e deixa as notas "aguardando vinculação",
-- pra você vincular no item CERTO no Monitor e reprocessar.
-- ⚠️ Blocos 2 e 3 ESCREVEM. Rode o bloco 1 antes (confere).
-- Tenant SPN: ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5
-- ============================================================

-- BLOCO 1 — CONFERE os itens que serão desvinculados (só leitura)
select n.numero, n.nome_emitente, ni.descricao_nfe as item_real, i.nome as vinculo_errado
from nfe_itens ni
join nfe_recebidas n          on n.id  = ni.nfe_id
join insumo_fornecedores ifv  on ifv.id = ni.vinculacao_id
join fornecedores f           on f.id  = ifv.fornecedor_id
left join insumos i           on i.id  = ifv.insumo_id
where n.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and n.status in ('pronta','aguard_vinculacao')
  and regexp_replace(coalesce(f.cnpj,''),         '[^0-9]','','g')
   <> regexp_replace(coalesce(n.cnpj_emitente,''),'[^0-9]','','g')
order by n.nome_emitente, n.numero;


-- BLOCO 2 — ZERA o vínculo errado nesses itens (escreve)
update nfe_itens ni set vinculacao_id = null
from nfe_recebidas n, insumo_fornecedores ifv, fornecedores f
where ni.nfe_id = n.id and ifv.id = ni.vinculacao_id and f.id = ifv.fornecedor_id
  and n.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and n.status in ('pronta','aguard_vinculacao')
  and regexp_replace(coalesce(f.cnpj,''),         '[^0-9]','','g')
   <> regexp_replace(coalesce(n.cnpj_emitente,''),'[^0-9]','','g');


-- BLOCO 3 — põe essas notas como "aguardando vinculação" (escreve)
update nfe_recebidas
set status = 'aguard_vinculacao'
where tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and cnpj_emitente in ('29565930000174','53056662000140')
  and status = 'pronta';


-- BLOCO 4 — CONFERE (só leitura): itens dessas notas agora sem vínculo
select n.numero, n.nome_emitente, ni.descricao_nfe, ni.vinculacao_id
from nfe_itens ni
join nfe_recebidas n on n.id = ni.nfe_id
where n.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and n.cnpj_emitente in ('29565930000174','53056662000140')
order by n.nome_emitente, n.numero;
-- Esperado: coluna vinculacao_id = null (vazia) em todas.
