-- ═══════════════════════════════════════════════════════════════════
-- Revisão Estoque — Fase 4 (E19 + E20). Rodar no Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- E19 · Fonte única do custo médio: função no banco chamada pelo botão
-- "Recalcular". Reconstrói o custo médio por média móvel ponderada, em
-- ordem cronológica (entrada q>0 pondera; entrada q=0 redefine o custo;
-- saída baixa a quantidade). Mesma regra do custoMedioNaData (lib/cost.ts).
-- p_insumos = null  -> recalcula TODOS os insumos com movimento na loja.
-- ───────────────────────────────────────────────────────────────────
create or replace function public.recalc_custo_medio(p_loja uuid, p_insumos uuid[] default null)
returns integer
language plpgsql
security invoker
as $$
declare
  v_tenant uuid := get_my_tenant_id();
  ins uuid;
  r   record;
  q   numeric;
  cm  numeric;
  nq  numeric;
  n   integer := 0;
begin
  for ins in
    select distinct x.insumo_id from (
      select insumo_id from public.entradas_estoque where tenant_id = v_tenant and loja_id = p_loja
      union
      select insumo_id from public.saidas_estoque  where tenant_id = v_tenant and loja_id = p_loja
    ) x
    where p_insumos is null or x.insumo_id = any(p_insumos)
  loop
    q := 0; cm := 0;
    for r in
      select criado_em, true  as ent, coalesce(quantidade,0) as qq, coalesce(custo_unitario,0) as vv
        from public.entradas_estoque where tenant_id = v_tenant and loja_id = p_loja and insumo_id = ins
      union all
      select criado_em, false as ent, coalesce(quantidade,0) as qq, 0 as vv
        from public.saidas_estoque  where tenant_id = v_tenant and loja_id = p_loja and insumo_id = ins
      order by criado_em asc
    loop
      if r.ent then
        if r.qq = 0 then cm := r.vv;                                   -- ajuste de custo médio (redefine)
        else nq := q + r.qq; cm := case when nq > 0 then (q*cm + r.qq*r.vv)/nq else cm end; q := nq; end if;
      else q := greatest(0, q - r.qq); end if;
    end loop;
    insert into public.saldo_estoque (tenant_id, insumo_id, loja_id, quantidade, custo_medio, atualizado_em)
    values (v_tenant, ins, p_loja, round(q,4), round(cm,6), now())
    on conflict (tenant_id, insumo_id, loja_id)
    do update set quantidade = excluded.quantidade, custo_medio = excluded.custo_medio, atualizado_em = now();
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.recalc_custo_medio(uuid, uuid[]) to authenticated, anon;

-- ───────────────────────────────────────────────────────────────────
-- E20 · Trava de fechamento no banco: não deixa ALTERAR uma competência
-- já 'fechado' (o refechar/upsert bate na trava). Reabrir continua sendo
-- DELETE (permitido), então segue funcionando.
-- ───────────────────────────────────────────────────────────────────
create or replace function public.trava_fechamento_custo()
returns trigger
language plpgsql
as $$
begin
  if old.situacao = 'fechado' then
    raise exception 'Competência já fechada — reabra antes de alterar (fechamento_custo).';
  end if;
  return new;
end $$;

drop trigger if exists trg_trava_fechamento on public.fechamento_custo;
create trigger trg_trava_fechamento
  before update on public.fechamento_custo
  for each row execute function public.trava_fechamento_custo();
