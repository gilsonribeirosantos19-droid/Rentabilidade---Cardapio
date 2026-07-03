-- ============================================================
-- ESTORNO da nota 240 (MARFOOD) que entrou ERRADO como Bomba Tare (SPN)
-- ⚠️ O bloco 2 ESCREVE (desfaz a entrada + recalcula custo médio). ATÔMICO.
-- Rode o bloco 1 primeiro (confere), só depois o bloco 2.
-- Tenant SPN: ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5
-- ============================================================

-- BLOCO 1 — CONFIRA a nota certa antes de estornar (só leitura)
select id, numero, serie, nome_emitente, cnpj_emitente, valor_total, status
from nfe_recebidas
where tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and numero = '240' and cnpj_emitente = '48065099000136';
-- Deve retornar 1 linha: MARFOOD, 240/001, R$ 20.056, status = processada.


-- BLOCO 2 — ESTORNA (rode SÓ depois de conferir o bloco 1)
-- Desfaz a entrada de 7.360 kg de Bomba Tare em Ponta Negra e recalcula o custo médio.
select estornar_nfe(id)
from nfe_recebidas
where tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and numero = '240' and cnpj_emitente = '48065099000136'
  and status = 'processada';


-- BLOCO 3 — CONFIRA que estornou (só leitura)
-- 3a) a nota deve ter voltado de 'processada' para outro status (ex.: aguard_vinculacao)
select numero, serie, nome_emitente, status
from nfe_recebidas
where tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and numero = '240' and cnpj_emitente = '48065099000136';

-- 3b) NÃO deve sobrar entrada dessa nota no estoque
select e.nfe_numero, l.nome as loja, i.nome as item, e.quantidade, e.custo_total
from entradas_estoque e
left join insumos i on i.id = e.insumo_id
left join lojas l on l.id = e.loja_id
where e.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and e.nfe_numero like '240/%';   -- esperado: NENHUMA linha
