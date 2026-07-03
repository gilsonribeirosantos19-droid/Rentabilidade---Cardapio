-- ============================================================
-- DIAGNÓSTICO: NF-e duplicada em nfe_recebidas
-- Rode no Supabase > SQL Editor. NÃO altera nada (só consulta).
-- ============================================================

-- A) DUPLICATAS POR CHAVE DE ACESSO (a mais grave — mesma nota 2x)
select chave_acesso,
       count(*)                                   as qtd,
       array_agg(id order by data_integracao)     as ids,
       array_agg(numero order by data_integracao) as numeros,
       array_agg(status order by data_integracao) as status,
       array_agg(fonte order by data_integracao)  as fontes,
       array_agg(data_integracao order by data_integracao) as integracoes
from nfe_recebidas
where chave_acesso is not null and chave_acesso <> ''
group by chave_acesso
having count(*) > 1
order by qtd desc
limit 50;

-- B) DUPLICATAS POR NÚMERO+SÉRIE+CNPJ (pega também notas SEM chave)
select cnpj_emitente, nome_emitente, numero, serie,
       count(*)                                   as qtd,
       array_agg(id order by data_integracao)     as ids,
       array_agg(chave_acesso)                    as chaves,
       array_agg(status)                          as status
from nfe_recebidas
group by tenant_id, cnpj_emitente, nome_emitente, numero, serie
having count(*) > 1
order by qtd desc
limit 50;

-- C) A TRAVA DE UNICIDADE EXISTE NO BANCO? (lista os índices da tabela)
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'nfe_recebidas';

-- D) RESUMO: quantas notas têm chave vazia/nula (que ficam SEM proteção)
select
  count(*)                                                              as total_notas,
  count(*) filter (where chave_acesso is null or chave_acesso = '')     as sem_chave,
  count(*) filter (where chave_acesso is not null and chave_acesso<>'') as com_chave
from nfe_recebidas;
