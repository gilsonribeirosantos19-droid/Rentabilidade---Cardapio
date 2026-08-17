-- custo_medio_ate: custo médio de CADA insumo "refazendo o filme" dos movimentos até uma data,
-- porém NO BANCO (C2 da auditoria — escala p/ 50+ lojas sem baixar todo o histórico pro navegador).
--
-- Reproduz FIELMENTE a lógica de lib/cost.ts › custoMedioNaData:
--   percorre entradas+saídas do insumo em ordem de data e mantém (q, cm):
--     • ENTRADA com qtd>0: cm = (q*cm + qtd*custo) / (q+qtd);  q += qtd
--     • ENTRADA com qtd=0 e custo>0: cm = custo   (ajuste de custo médio)
--     • SAÍDA: q = max(0, q - qtd)   (custo médio não muda)
--   retorna o cm final de cada insumo.
--
-- p_loja: se informado, refaz o filme só daquela loja (igual ao filtro por loja da tela);
--         se nulo, mistura todas as lojas do tenant (igual a "Todas as lojas").
--
-- IMPORTANTE: não substitui nada sozinho — a tela vai usar isso e MANTER o fallback
-- (saldo/vínculo/preço) pros insumos que vierem com custo 0, pra o CMV nunca zerar.

create or replace function public.custo_medio_ate(p_tenant uuid, p_ate date, p_loja uuid default null)
returns table(insumo_id uuid, custo_medio numeric)
language plpgsql
stable
as $$
declare
  r        record;
  cur_ins  uuid := null;
  q        numeric := 0;
  cm       numeric := 0;
  lim      timestamptz := (p_ate::text || 'T23:59:59.999Z')::timestamptz;   -- mesmo teto do front (criado_em <= ate T23:59:59)
begin
  for r in
    select e.insumo_id as ins, e.criado_em as dt, true as ent,
           coalesce(e.quantidade, 0) as qt, coalesce(e.custo_unitario, 0) as v
      from public.entradas_estoque e
     where e.tenant_id = p_tenant and e.criado_em <= lim
       and (p_loja is null or e.loja_id = p_loja)
    union all
    select s.insumo_id, s.criado_em, false,
           coalesce(s.quantidade, 0), 0
      from public.saidas_estoque s
     where s.tenant_id = p_tenant and s.criado_em <= lim
       and (p_loja is null or s.loja_id = p_loja)
    -- empate de data: ENTRADA antes de SAÍDA (mesma ordem do lib/cost.ts, que empilha entradas
    -- primeiro num sort estável). Sem isso, uma saída no MESMO instante distorce o custo médio.
    order by ins, dt, ent desc
  loop
    if r.ins is distinct from cur_ins then
      if cur_ins is not null then
        insumo_id := cur_ins; custo_medio := round(cm, 6); return next;
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
      q := greatest(0, q - r.qt);                                   -- saída não mexe no custo médio
    end if;
  end loop;

  if cur_ins is not null then
    insumo_id := cur_ins; custo_medio := round(cm, 6); return next;
  end if;
end;
$$;

grant execute on function public.custo_medio_ate(uuid, date, uuid) to anon, authenticated;

-- ROLLBACK: drop function if exists public.custo_medio_ate(uuid, date, uuid);
