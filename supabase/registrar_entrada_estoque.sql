-- registrar_entrada_estoque: grava uma ENTRADA de estoque de forma ATÔMICA (M2/M3 da auditoria).
--
-- Problema que resolve (lost update): o front fazia, em passos separados e SEM trava,
--   1) insert em entradas_estoque
--   2) ler o saldo (do cache da tela) e calcular a média ponderada
--   3) regravar saldo_estoque
-- Duas entradas do mesmo insumo/loja quase simultâneas leem o MESMO saldo velho → a 2ª
-- sobrescreve a 1ª (some quantidade / o custo médio distorce).
--
-- Aqui tudo roda numa transação só, TRAVANDO a linha do saldo (SELECT ... FOR UPDATE), então
-- entradas concorrentes se enfileiram e cada uma soma sobre o saldo REAL.
--
-- Fórmula do custo médio = a MESMA do lib/cost.ts (mediaPonderada): o peso do saldo anterior
-- nunca é negativo (greatest(0, qAnt)) — saldo negativo não tem base de custo real.
--
-- entrada + saldo = ATÔMICOS (nunca um sem o outro). histórico e vínculo do fornecedor ficam
-- "best-effort" (num sub-bloco que engole erro), preservando o comportamento do front (eram
-- opcionais lá) — uma falha neles NÃO desfaz a entrada.
--
-- p_entrada: jsonb com os mesmos campos que o front já montava (ver abaixo).

create or replace function public.registrar_entrada_estoque(p_entrada jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_tenant uuid := (p_entrada->>'tenant_id')::uuid;
  v_insumo uuid := (p_entrada->>'insumo_id')::uuid;
  v_loja   uuid := (p_entrada->>'loja_id')::uuid;
  v_qtd    numeric := coalesce((p_entrada->>'quantidade')::numeric, 0);      -- já convertida (× fator)
  v_custo  numeric := coalesce((p_entrada->>'custo_unitario')::numeric, 0);  -- já convertido (÷ fator)
  v_qA numeric; v_cmA numeric; v_qAc numeric; v_qN numeric; v_cmN numeric;
  v_ent_id uuid;
begin
  if v_tenant is null or v_insumo is null or v_loja is null then
    raise exception 'tenant/insumo/loja são obrigatórios';
  end if;
  if v_qtd <= 0 then raise exception 'quantidade deve ser maior que zero'; end if;
  if v_custo <= 0 then raise exception 'custo unitário deve ser maior que zero'; end if;

  -- garante que existe uma linha de saldo pra travar (no-op se já existir)
  insert into public.saldo_estoque (tenant_id, insumo_id, loja_id, quantidade, custo_medio, atualizado_em)
  values (v_tenant, v_insumo, v_loja, 0, 0, now())
  on conflict (tenant_id, insumo_id, loja_id) do nothing;

  -- TRAVA a linha e lê o saldo REAL (serializa entradas concorrentes)
  select quantidade, custo_medio into v_qA, v_cmA
    from public.saldo_estoque
   where tenant_id = v_tenant and insumo_id = v_insumo and loja_id = v_loja
   for update;

  v_qA  := coalesce(v_qA, 0);
  v_cmA := coalesce(v_cmA, 0);
  v_qAc := greatest(0, v_qA);                                  -- saldo negativo não pesa no custo médio
  v_qN  := round(v_qA + v_qtd, 4);
  v_cmN := case when (v_qAc + v_qtd) > 0
                then round((v_qAc * v_cmA + v_qtd * v_custo) / (v_qAc + v_qtd), 6)
                else v_custo end;

  -- grava a entrada (mesmos campos do front)
  insert into public.entradas_estoque (
    tenant_id, insumo_id, loja_id, fornecedor_id, fornecedor_nome,
    quantidade, quantidade_fornecedor, unidade_compra, fator_conversao,
    custo_unitario, lote, validade, tipo, observacao, responsavel, criado_em
  ) values (
    v_tenant, v_insumo, v_loja,
    nullif(p_entrada->>'fornecedor_id','')::uuid, p_entrada->>'fornecedor_nome',
    v_qtd, (p_entrada->>'quantidade_fornecedor')::numeric, p_entrada->>'unidade_compra',
    (p_entrada->>'fator_conversao')::numeric,
    v_custo, p_entrada->>'lote', nullif(p_entrada->>'validade','')::date,
    coalesce(p_entrada->>'tipo','manual'), p_entrada->>'observacao', p_entrada->>'responsavel',
    coalesce((p_entrada->>'criado_em')::timestamptz, now())
  ) returning id into v_ent_id;

  -- atualiza o saldo travado
  update public.saldo_estoque
     set quantidade = v_qN, custo_medio = v_cmN, atualizado_em = now()
   where tenant_id = v_tenant and insumo_id = v_insumo and loja_id = v_loja;

  -- histórico de custo (best-effort: falha aqui NÃO desfaz a entrada)
  begin
    insert into public.historico_custo (
      tenant_id, insumo_id, loja_id, saldo_anterior, custo_medio_anterior,
      qtd_entrada, custo_entrada, novo_custo_medio, impacto_pct, origem
    ) values (
      v_tenant, v_insumo, v_loja, round(v_qA,4), round(v_cmA,4),
      round(v_qtd,4), round(v_custo,4), round(v_cmN,4),
      case when v_cmA > 0 then round(((v_cmN - v_cmA)/v_cmA)*100, 4) else null end,
      coalesce(p_entrada->>'origem','manual')
    );
  exception when others then null;
  end;

  -- preço no vínculo insumo→fornecedor (best-effort)
  begin
    if nullif(p_entrada->>'fornecedor_id','') is not null then
      update public.insumo_fornecedores set preco_unitario = round(v_custo,6)
       where insumo_id = v_insumo and fornecedor_id = (p_entrada->>'fornecedor_id')::uuid;
    end if;
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'entrada_id', v_ent_id, 'saldo', v_qN, 'custo_medio', v_cmN);
end;
$$;

grant execute on function public.registrar_entrada_estoque(jsonb) to anon, authenticated;

-- ROLLBACK: drop function if exists public.registrar_entrada_estoque(jsonb);
