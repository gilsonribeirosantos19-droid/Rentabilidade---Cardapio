-- ============================================================
-- ESTORNO das notas de "Gas Cozinha" e "Me - Bobina Termina" (SPN)
-- (fator errado / unidades misturadas inflaram o valor na Curva ABC)
-- ⚠️ BLOCO 2 ESCREVE (estorna cada nota + recalcula custo médio). ATÔMICO por nota.
-- Rode o BLOCO 1 antes (confere). Tenant SPN: ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5
-- ============================================================

-- BLOCO 1 — CONFERE as notas que serão estornadas (só leitura)
select distinct n.numero, n.serie, n.nome_emitente, n.status
from nfe_recebidas n
where n.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and n.status = 'processada'
  and (n.numero || '/' || n.serie) in (
    select distinct e.nfe_numero
    from entradas_estoque e
    join insumos i on i.id = e.insumo_id
    where e.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
      and (i.nome ilike '%gas cozinha%' or i.nome ilike '%bobina termi%')
      and e.nfe_numero is not null
  )
order by n.nome_emitente, n.numero;


-- BLOCO 2 — ESTORNA todas (rode SÓ depois de conferir o bloco 1)
select n.numero, n.nome_emitente, estornar_nfe(n.id) as estorno
from (
  select distinct nn.id, nn.numero, nn.nome_emitente
  from nfe_recebidas nn
  where nn.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
    and nn.status = 'processada'
    and (nn.numero || '/' || nn.serie) in (
      select distinct e.nfe_numero
      from entradas_estoque e
      join insumos i on i.id = e.insumo_id
      where e.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
        and (i.nome ilike '%gas cozinha%' or i.nome ilike '%bobina termi%')
        and e.nfe_numero is not null
    )
) n;


-- BLOCO 3 — CONFERE (só leitura): não deve sobrar entrada desses itens
select i.nome, count(*) as entradas_restantes, coalesce(sum(e.custo_total),0) as valor
from entradas_estoque e
join insumos i on i.id = e.insumo_id
where e.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
  and (i.nome ilike '%gas cozinha%' or i.nome ilike '%bobina termi%')
group by i.nome;
-- Esperado: 0 entradas (ou só as manuais, se houver).
