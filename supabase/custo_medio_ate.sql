-- custo_medio_ate: custo médio de CADA insumo "refazendo o filme" dos movimentos até uma data,
-- porém NO BANCO (C2 — escala p/ 50+ lojas sem baixar todo o histórico pro navegador).
--
-- Reproduz FIELMENTE lib/cost.ts › custoMedioNaData, inclusive a ARITMÉTICA: usa `double precision`
-- (IEEE 754 double = o mesmo tipo de número do JavaScript) e NÃO arredonda o resultado — assim o
-- valor bate DÍGITO POR DÍGITO com o cálculo da tela, pro CMV ficar 100% igual.
--
-- Ordem dos movimentos = data (criado_em); no EMPATE, ENTRADA antes de SAÍDA (igual ao sort estável
-- do cost.ts, que empilha as entradas primeiro). Sem isso, uma saída no mesmo instante distorce.
--
-- p_loja: se informado, refaz só daquela loja; se nulo, mistura todas as lojas do tenant.

create or replace function public.custo_medio_ate(p_tenant uuid, p_ate date, p_loja uuid default null)
returns table(insumo_id uuid, custo_medio double precision)
language plpgsql
stable
as $$
declare
  r        record;
  cur_ins  uuid := null;
  q        double precision := 0;
  cm       double precision := 0;
  lim      timestamptz := (p_ate::text || 'T23:59:59')::timestamptz;   -- mesmo teto/fuso da consulta do front
begin
  for r in
    select e.insumo_id as ins, e.criado_em as dt, true as ent,
           coalesce(e.quantidade, 0)::double precision   as qt,
           coalesce(e.custo_unitario, 0)::double precision as v
      from public.entradas_estoque e
     where e.tenant_id = p_tenant and e.criado_em <= lim
       and (p_loja is null or e.loja_id = p_loja)
    union all
    select s.insumo_id, s.criado_em, false,
           coalesce(s.quantidade, 0)::double precision, 0::double precision
      from public.saidas_estoque s
     where s.tenant_id = p_tenant and s.criado_em <= lim
       and (p_loja is null or s.loja_id = p_loja)
    order by ins, dt, ent desc
  loop
    if r.ins is distinct from cur_ins then
      if cur_ins is not null then
        insumo_id := cur_ins; custo_medio := cm; return next;
      end if;
      cur_ins := r.ins; q := 0; cm := 0;
    end if;

    if r.ent then
      if r.qt = 0 then
        if r.v > 0 then cm := r.v; end if;                          -- ajuste de custo médio
      else
        if (q + r.qt) > 0 then cm := (q * cm + r.qt * r.v) / (q + r.qt); end if;
        q := q + r.qt;
      end if;
    else
      q := greatest(0::double precision, q - r.qt);                 -- saída não mexe no custo médio
    end if;
  end loop;

  if cur_ins is not null then
    insumo_id := cur_ins; custo_medio := cm; return next;
  end if;
end;
$$;

grant execute on function public.custo_medio_ate(uuid, date, uuid) to anon, authenticated;

-- ROLLBACK: drop function if exists public.custo_medio_ate(uuid, date, uuid);
