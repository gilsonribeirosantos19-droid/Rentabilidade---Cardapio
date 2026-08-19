-- registrar_saida_estoque: grava uma SAÍDA de estoque (consumo/perda) de forma ATÔMICA (M2/M3).
--
-- Mesmo problema de lost-update do registrar_entrada_estoque, do lado da baixa: o front fazia
-- insert em saidas_estoque + ler saldo do cache + regravar saldo, em passos soltos e sem trava.
-- Aqui: transação única com SELECT ... FOR UPDATE na linha do saldo.
--
-- Saída NÃO altera o custo médio (só debita a quantidade). A verificação de saldo negativo é
-- AUTORITATIVA aqui dentro (sob trava, no saldo REAL): se a saída deixaria o saldo negativo e o
-- tenant não permite estoque negativo (p_permite_negativo=false), levanta erro. O front continua
-- fazendo a pré-checagem + confirmação (UX), mas a decisão final é do banco.
--
-- OBS: transferência entre lojas continua na RPC transferir_estoque (já atômica) — esta função é
-- só pra saída normal (consumo, perda, etc.).
--
-- p_saida: jsonb { tenant_id, insumo_id, loja_id, quantidade, tipo, motivo, responsavel,
--                  criado_em, permite_negativo }

create or replace function public.registrar_saida_estoque(p_saida jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_tenant uuid := (p_saida->>'tenant_id')::uuid;
  v_insumo uuid := (p_saida->>'insumo_id')::uuid;
  v_loja   uuid := (p_saida->>'loja_id')::uuid;
  v_qtd    numeric := coalesce((p_saida->>'quantidade')::numeric, 0);
  v_neg    boolean := coalesce((p_saida->>'permite_negativo')::boolean, false);
  v_clamp  boolean := coalesce((p_saida->>'clamp_zero')::boolean, false);   -- Portal: saldo nunca fica negativo (piso 0), nunca bloqueia
  v_qA numeric; v_qN numeric;
  v_sai_id uuid;
begin
  if v_tenant is null or v_insumo is null or v_loja is null then
    raise exception 'tenant/insumo/loja são obrigatórios';
  end if;
  if v_qtd <= 0 then raise exception 'quantidade deve ser maior que zero'; end if;

  -- garante linha de saldo pra travar (no-op se já existir)
  insert into public.saldo_estoque (tenant_id, insumo_id, loja_id, quantidade, custo_medio, atualizado_em)
  values (v_tenant, v_insumo, v_loja, 0, 0, now())
  on conflict (tenant_id, insumo_id, loja_id) do nothing;

  -- TRAVA e lê o saldo REAL
  select quantidade into v_qA
    from public.saldo_estoque
   where tenant_id = v_tenant and insumo_id = v_insumo and loja_id = v_loja
   for update;
  v_qA := coalesce(v_qA, 0);
  v_qN := round(v_qA - v_qtd, 4);

  if v_clamp then
    v_qN := greatest(0, v_qN);                                   -- modo Portal: piso 0, não bloqueia
  elsif v_qN < 0 and not v_neg then
    raise exception 'Saldo insuficiente: saída de % supera o saldo disponível (%).', v_qtd, v_qA;   -- checagem autoritativa (sob trava)
  end if;

  insert into public.saidas_estoque (tenant_id, insumo_id, loja_id, quantidade, tipo, motivo, responsavel, criado_em)
  values (
    v_tenant, v_insumo, v_loja, v_qtd, p_saida->>'tipo',
    p_saida->>'motivo', p_saida->>'responsavel',
    coalesce((p_saida->>'criado_em')::timestamptz, now())
  ) returning id into v_sai_id;

  -- debita o saldo travado (custo médio NÃO muda)
  update public.saldo_estoque set quantidade = v_qN, atualizado_em = now()
   where tenant_id = v_tenant and insumo_id = v_insumo and loja_id = v_loja;

  return jsonb_build_object('ok', true, 'saida_id', v_sai_id, 'saldo', v_qN);
end;
$$;

grant execute on function public.registrar_saida_estoque(jsonb) to anon, authenticated;

-- ROLLBACK: drop function if exists public.registrar_saida_estoque(jsonb);
