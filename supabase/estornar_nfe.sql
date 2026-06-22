-- ============================================================================
-- estornar_nfe(p_nfe_id)
-- Estorna uma NF-e processada de forma ATÔMICA (tudo-ou-nada — uma transação).
-- Faz, numa só transação:
--   1) captura os pares (insumo, loja) afetados pela nota;
--   2) remove as entradas de estoque dessa nota;
--   3) recalcula saldo + custo médio de cada par (com o que sobrou);
--   4) devolve a nota ao Monitor (status 'pronta', processada_em = null);
--   5) registra log de auditoria.
-- Se QUALQUER passo falhar, NADA é gravado (não trava a nota pela metade).
--
-- Idempotente/recuperável: se as entradas já tiverem sido removidas (nota
-- travada por um estorno antigo que falhou no meio), ela mesmo assim reseta o
-- status e devolve a nota ao Monitor — destrava sem efeito colateral.
--
-- SECURITY INVOKER: roda como o usuário logado (RLS por tenant continua valendo).
-- Rodar este arquivo inteiro no Supabase -> SQL Editor.
-- ============================================================================

create or replace function public.estornar_nfe(p_nfe_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_nfe      public.nfe_recebidas%rowtype;
  v_ref      text;
  v_chave    text;
  v_tenant   uuid;
  r          record;
  v_tot      numeric;
  v_sai      numeric;
  v_cm       numeric;
  v_pares    int := 0;
  v_apagadas int := 0;
begin
  select * into v_nfe from public.nfe_recebidas where id = p_nfe_id;
  if not found then raise exception 'NF-e não encontrada'; end if;

  v_tenant := v_nfe.tenant_id;
  -- mesmo formato gravado no processamento: numero/serie (ex: 838919/38)
  v_ref := v_nfe.numero::text || '/' || v_nfe.serie::text;
  v_chave := v_nfe.chave_acesso;

  -- Identifica as entradas DESTA nota pela CHAVE (única). Notas antigas (sem chave
  -- gravada na entrada) caem no fallback por numero/serie. numero/serie sozinho NÃO
  -- é único entre fornecedores — por isso a chave é preferida.

  -- 1) captura os pares (insumo, loja) afetados ANTES de apagar
  drop table if exists _estorno_pares;
  create temp table _estorno_pares on commit drop as
    select distinct insumo_id, loja_id
    from public.entradas_estoque
    where tenant_id = v_tenant
      and ( (v_chave is not null and chave_acesso = v_chave)
            or (chave_acesso is null and nfe_numero = v_ref) );
  select count(*) into v_pares from _estorno_pares;

  -- 2) apaga as entradas desta nota
  delete from public.entradas_estoque
   where tenant_id = v_tenant
     and ( (v_chave is not null and chave_acesso = v_chave)
           or (chave_acesso is null and nfe_numero = v_ref) );
  get diagnostics v_apagadas = row_count;

  -- 3) recalcula saldo + custo médio de cada par (reconstrói com o que sobrou)
  for r in select insumo_id, loja_id from _estorno_pares loop
    select coalesce(sum(quantidade), 0),
           case when coalesce(sum(quantidade), 0) > 0
                then sum(quantidade * coalesce(custo_unitario, 0)) / sum(quantidade)
                else 0 end
      into v_tot, v_cm
      from public.entradas_estoque
     where tenant_id = v_tenant and insumo_id = r.insumo_id
       and loja_id is not distinct from r.loja_id;

    select coalesce(sum(quantidade), 0) into v_sai
      from public.saidas_estoque
     where tenant_id = v_tenant and insumo_id = r.insumo_id
       and loja_id is not distinct from r.loja_id;

    insert into public.saldo_estoque (tenant_id, insumo_id, loja_id, quantidade, custo_medio, atualizado_em)
    values (v_tenant, r.insumo_id, r.loja_id, round(v_tot - v_sai, 6), round(v_cm, 6), now())
    on conflict (tenant_id, insumo_id, loja_id)
    do update set quantidade = excluded.quantidade,
                  custo_medio = excluded.custo_medio,
                  atualizado_em = excluded.atualizado_em;
  end loop;

  -- 4) devolve a nota ao Monitor — SEMPRE (mesmo sem entradas: destrava nota presa)
  update public.nfe_recebidas
     set status = 'pronta', processada_em = null
   where id = p_nfe_id;

  -- 5) log de auditoria (não derruba o estorno se a tabela de log falhar)
  begin
    insert into public.nfe_log (tenant_id, nfe_id, acao, descricao)
    values (v_tenant, p_nfe_id, 'estorno',
      'NF-e ' || v_nfe.numero || ' estornada (atômica) — ' || v_apagadas
      || ' entradas removidas, ' || v_pares || ' itens recalculados; voltou ao Monitor');
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'apagadas', v_apagadas, 'pares', v_pares, 'ref', v_ref);
end;
$$;

-- Permite que o app (usuário logado) chame a função
grant execute on function public.estornar_nfe(uuid) to authenticated, anon;
