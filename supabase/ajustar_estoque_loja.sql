-- ajustar_estoque_loja: AJUSTE de estoque de uma loja de forma ATÔMICA (M2/M3).
--
-- O ajuste DEFINE o saldo pra um valor absoluto (p_ajuste.nova) e registra o movimento da
-- diferença: entrada (se subiu) ou saída (se caiu), tipo='ajuste'. Antes isso eram 2-3 idas ao
-- banco soltas (checar duplicado + inserir movimento + upsert saldo) lendo o saldo do cache.
--
-- Aqui: transação única com SELECT ... FOR UPDATE. A diferença é recalculada sobre o saldo REAL
-- (sob trava) — então o movimento registrado é sempre preciso, mesmo se o saldo mudou no meio.
--
-- IDEMPOTÊNCIA natural: como o saldo é ABSOLUTO, um segundo clique idêntico calcula dif=0 e não
-- faz nada (não duplica movimento). Por isso não precisa mais da checagem de duplicado do front.
--
-- Custo médio NÃO é alterado (ajuste é de quantidade). No ajuste POSITIVO, a entrada carrega o
-- custo médio vigente como custo_unitario, pra o recálculo noturno não entrar com custo 0.
--
-- p_ajuste: jsonb { tenant_id, insumo_id, loja_id, nova, motivo, criado_em }

create or replace function public.ajustar_estoque_loja(p_ajuste jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_tenant uuid := (p_ajuste->>'tenant_id')::uuid;
  v_insumo uuid := (p_ajuste->>'insumo_id')::uuid;
  v_loja   uuid := (p_ajuste->>'loja_id')::uuid;
  v_nova   numeric := coalesce((p_ajuste->>'nova')::numeric, 0);
  v_motivo text := p_ajuste->>'motivo';
  v_data   timestamptz := coalesce((p_ajuste->>'criado_em')::timestamptz, now());
  v_qA numeric; v_cmA numeric; v_dif numeric; v_mov_id uuid;
begin
  if v_tenant is null or v_insumo is null or v_loja is null then
    raise exception 'tenant/insumo/loja são obrigatórios';
  end if;
  if v_nova < 0 then raise exception 'a nova quantidade não pode ser negativa'; end if;

  -- garante linha de saldo pra travar (no-op se já existir)
  insert into public.saldo_estoque (tenant_id, insumo_id, loja_id, quantidade, custo_medio, atualizado_em)
  values (v_tenant, v_insumo, v_loja, 0, 0, now())
  on conflict (tenant_id, insumo_id, loja_id) do nothing;

  -- TRAVA e lê o saldo REAL
  select quantidade, custo_medio into v_qA, v_cmA
    from public.saldo_estoque
   where tenant_id = v_tenant and insumo_id = v_insumo and loja_id = v_loja
   for update;
  v_qA  := coalesce(v_qA, 0);
  v_cmA := coalesce(v_cmA, 0);
  v_dif := round(v_nova - v_qA, 4);

  if v_dif = 0 then
    return jsonb_build_object('ok', true, 'sem_mudanca', true, 'saldo', v_qA);
  end if;

  if v_dif > 0 then
    -- subiu → entrada de ajuste, carregando o custo médio vigente.
    -- entradas_estoque NÃO tem coluna motivo: o texto do motivo vai em observacao.
    insert into public.entradas_estoque (tenant_id, insumo_id, loja_id, quantidade, tipo, observacao, custo_unitario, criado_em)
    values (v_tenant, v_insumo, v_loja, v_dif, 'ajuste', coalesce(nullif(v_motivo, ''), 'Ajuste de estoque'), round(v_cmA, 6), v_data)
    returning id into v_mov_id;
  else
    -- caiu → saída de ajuste (saidas_estoque tem motivo E observacao)
    insert into public.saidas_estoque (tenant_id, insumo_id, loja_id, quantidade, tipo, motivo, observacao, criado_em)
    values (v_tenant, v_insumo, v_loja, abs(v_dif), 'ajuste', v_motivo, 'Ajuste de estoque', v_data)
    returning id into v_mov_id;
  end if;

  -- define o saldo absoluto (custo médio fica o vigente — ajuste não mexe no custo)
  update public.saldo_estoque set quantidade = round(v_nova, 4), atualizado_em = now()
   where tenant_id = v_tenant and insumo_id = v_insumo and loja_id = v_loja;

  return jsonb_build_object('ok', true, 'movimento_id', v_mov_id, 'dif', v_dif, 'saldo', v_nova);
end;
$$;

grant execute on function public.ajustar_estoque_loja(jsonb) to anon, authenticated;

-- ROLLBACK: drop function if exists public.ajustar_estoque_loja(jsonb);
