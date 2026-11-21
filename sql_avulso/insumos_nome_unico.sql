-- ════════════════════════════════════════════════════════════════════════════
--  TRAVA ANTI-DUPLICIDADE DE INSUMOS (todos os tenants)
--  Não pode existir 2 insumos ATIVOS com o mesmo nome no mesmo cliente — ignorando
--  maiúsculas, acentos e espaços extras ("Kani" = " KANÍ " = "kani").
--  Vale para QUALQUER porta: tela, nota fiscal, importação em lote, SQL manual.
--  Mesma regra do app: app/src/lib/nome.ts (normNome).
--
--  ORDEM: rode o PASSO 1. Se listar algo, resolva (inative o duplicado) e rode de novo.
--         Quando o PASSO 1 vier vazio, rode o PASSO 2.
--
--  IMPORTAÇÃO EM LOTE daqui pra frente: use
--     insert into insumos (...) values (...)
--     on conflict (tenant_id, public.norm_nome_insumo(nome)) where ativo do nothing;
--  → rodar 2x NÃO duplica (a 2ª vez simplesmente não insere).
-- ════════════════════════════════════════════════════════════════════════════

-- função de normalização (IMMUTABLE p/ poder ser usada no índice)
create or replace function public.norm_nome_insumo(p text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(
           lower(translate(trim(coalesce(p, '')),
             'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
             'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')),
           '\s+', ' ', 'g')
$$;

-- ── PASSO 1 — duplicados ativos que impedem a trava (somente leitura) ──────────
select t.nome as cliente, i.tenant_id, public.norm_nome_insumo(i.nome) as nome_normalizado,
       count(*) as qtd,
       string_agg(i.nome || ' [cód ' || coalesce(i.codigo_interno::text, '-') || ' | id ' || i.id || ']', '  ||  ') as itens
from insumos i
left join tenants t on t.id = i.tenant_id
where i.ativo = true
group by t.nome, i.tenant_id, public.norm_nome_insumo(i.nome)
having count(*) > 1
order by t.nome, nome_normalizado;

-- ── PASSO 2 — cria a trava (só depois do PASSO 1 vir vazio) ────────────────────
do $$
declare v_dup int;
begin
  select count(*) into v_dup from (
    select 1 from insumos where ativo = true
    group by tenant_id, public.norm_nome_insumo(nome) having count(*) > 1
  ) x;
  if v_dup > 0 then
    raise exception 'Ainda existem % nomes duplicados ativos — resolva o PASSO 1 antes. Nada foi criado.', v_dup;
  end if;
  execute 'create unique index if not exists uq_insumos_nome_ativo
             on public.insumos (tenant_id, public.norm_nome_insumo(nome)) where ativo';
  raise notice 'OK: trava uq_insumos_nome_ativo criada.';
end $$;

-- conferência: a trava existe?
select indexname, indexdef from pg_indexes where indexname = 'uq_insumos_nome_ativo';
