-- ═══════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO: por que as entradas de NF-e não aparecem no Portal (loja Centro)
-- Rodar no Supabase → SQL Editor (ignora RLS, enxerga tudo).
-- ═══════════════════════════════════════════════════════════════════

-- 1) Qual é a loja "Centro" e o id dela (por tenant)
select id as loja_id, nome, tenant_id
from lojas
where nome ilike '%centro%';

-- 2) Onde as entradas de NF-e realmente caíram (contagem por loja)
--    Se "Centro" não aparecer aqui, as notas foram gravadas em OUTRA loja.
select e.loja_id,
       l.nome                     as loja,
       count(*)                   as qtd_entradas_nfe,
       min(e.criado_em)::date     as primeira,
       max(e.criado_em)::date     as ultima
from entradas_estoque e
left join lojas l on l.id = e.loja_id
where e.tipo = 'nfe'
group by e.loja_id, l.nome
order by qtd_entradas_nfe desc;

-- 3) O gerente e a loja a que ele está amarrado (deve bater com o id do passo 1)
select id, nome, email, role, loja_id
from usuarios
where role = 'gerente'
order by nome;

-- 4) (opcional) TODAS as entradas da loja Centro, de qualquer tipo/data
--    Troque <ID_DA_LOJA_CENTRO> pelo id que veio no passo 1.
-- select criado_em::date as data, tipo, insumo_id, quantidade, custo_unitario, nfe_numero
-- from entradas_estoque
-- where loja_id = '<ID_DA_LOJA_CENTRO>'
-- order by criado_em desc
-- limit 100;
