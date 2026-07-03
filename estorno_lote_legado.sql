-- ============================================================
-- ESTORNO EM LOTE — notas legadas vinculadas ao fornecedor ERRADO (SPN)
-- (item ligou num vínculo de fornecedor com CNPJ != emitente da nota)
-- ⚠️ O BLOCO 2 ESCREVE (estorna cada nota + recalcula custo médio). ATÔMICO por nota.
-- Rode o BLOCO 1 primeiro (confere), só depois o BLOCO 2.
-- Tenant SPN: ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5
-- ============================================================

-- BLOCO 1 — CONFERE quais notas SERÃO estornadas (só leitura)
select distinct n.numero, n.serie, n.nome_emitente, n.status
from nfe_itens ni
join nfe_recebidas n          on n.id  = ni.nfe_id
join insumo_fornecedores ifv  on ifv.id = ni.vinculacao_id
join fornecedores f           on f.id  = ifv.fornecedor_id
where n.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and n.status = 'processada'
  and regexp_replace(coalesce(f.cnpj,''),         '[^0-9]','','g')
   <> regexp_replace(coalesce(n.cnpj_emitente,''),'[^0-9]','','g')
order by n.nome_emitente, n.numero;
-- Esperado: ~16 notas (Alain Pinheiro + M F Embalagens).


-- BLOCO 2 — ESTORNA todas de uma vez (rode SÓ depois de conferir o bloco 1)
select n.numero, n.nome_emitente, estornar_nfe(n.id) as estorno
from (
  select distinct nn.id, nn.numero, nn.nome_emitente
  from nfe_itens ni
  join nfe_recebidas nn         on nn.id  = ni.nfe_id
  join insumo_fornecedores ifv  on ifv.id = ni.vinculacao_id
  join fornecedores f           on f.id  = ifv.fornecedor_id
  where nn.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
    and nn.status = 'processada'
    and regexp_replace(coalesce(f.cnpj,''),          '[^0-9]','','g')
     <> regexp_replace(coalesce(nn.cnpj_emitente,''),'[^0-9]','','g')
) n;


-- BLOCO 3 — CONFERE que estornou (só leitura): a lista de erros deve ficar VAZIA de 'processada'
select count(*) as ainda_processadas_com_erro
from nfe_itens ni
join nfe_recebidas n          on n.id  = ni.nfe_id
join insumo_fornecedores ifv  on ifv.id = ni.vinculacao_id
join fornecedores f           on f.id  = ifv.fornecedor_id
where n.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and n.status = 'processada'
  and regexp_replace(coalesce(f.cnpj,''),         '[^0-9]','','g')
   <> regexp_replace(coalesce(n.cnpj_emitente,''),'[^0-9]','','g');
-- Esperado: 0
