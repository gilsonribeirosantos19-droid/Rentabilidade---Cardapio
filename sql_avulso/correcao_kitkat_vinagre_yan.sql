-- =====================================================================
-- CORREÇÃO DE CONVERSÃO — YAN TORRES · Kit Kat e Vinagre · SÓ Sushi PN
--  Kit Kat (cód 872): "PC" virou DISPLAY de 24 em 09/09 e entrou como 1 un a R$144
--      → quantidade ×24, custo R$144 → R$6,00, fator 24
--  Vinagre 500ml (cód 808) "UND" = 1 frasco 0,5 L, mas entrou com fator 6 (01-02/09)
--      → quantidade ÷12, custo ×12 (R$5,00/L), fator 0,5
--  Vinagre 700ml (cód 898, notas 1991 e 1992) = fardo 12×700ml = 8,4 L, entrou com 9
--      → quantidade ×8,4/9, custo ×9/8,4, fator 8,4
--  + AJUSTE DE INVENTÁRIO (30/09) recalculado: o saldo pós-inventário continua = CONTADO
--  + saldo = atual + correção pós-inventário (igual à prévia) · custo médio refeito (regra do Recalcular)
--  + vínculo do Kit Kat (cód 872) → fator 24 (próximas notas já entram certas)
--
-- 3 PARTES: 1) prévia (só lê)  2) aplicar (bloco único do $$…$$)  3) conferência. Rode UMA de cada vez.
-- Rodar no SQL Editor — confira a ref trczpnjidqfippbfxtpe na URL.
-- =====================================================================
-- =====================================================================
-- PARTE 1 — PRÉVIA (SÓ LEITURA, não grava nada). Rode sozinha e confira.
-- saldo_depois = saldo_antes + correções feitas DEPOIS do inventário de 30/09
-- (as de ANTES são compensadas no ajuste do inventário → o contado continua valendo)
-- =====================================================================
with fix as (
  select e.id, e.loja_id, e.insumo_id, e.criado_em,
         case when lower(i.nome) = 'kit kat' then e.quantidade * 24
              when lower(e.unidade_compra) = 'und' then e.quantidade / 12
              else e.quantidade * 8.4 / 9 end - e.quantidade as d
    from public.entradas_estoque e
    join public.insumos i on i.id = e.insumo_id
   where e.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
     and e.fornecedor_nome ~* 'yan torres'
     and ( (lower(i.nome) = 'kit kat' and e.custo_unitario > 50)
        or (lower(i.nome) = 'vinagre' and lower(e.unidade_compra) = 'und' and e.fator_conversao = 6)
        or (lower(i.nome) = 'vinagre' and e.fator_conversao = 9 and e.nfe_numero in ('1991/002','1992/002')) )
), inv as (
  select v.loja_id, ii.insumo_id, max((coalesce(v.data_final, v.data_inicial)::date + time '12:00')::timestamptz) as ts
    from public.inventarios v
    join public.inventario_itens ii on ii.inventario_id = v.id and ii.qtd_contada is not null
   where v.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5' and v.status = 'encerrado'
   group by 1, 2
)
select i.nome as item, l.nome as loja,
       count(f.id) as lanc_corrigidos,
       round(coalesce(sum(f.d), 0), 2) as qtd_corrigida,
       to_char(inv.ts, 'DD/MM') as inventario,
       round(coalesce(sum(f.d) filter (where inv.ts is not null and f.criado_em <= inv.ts), 0), 2) as compensado_no_inventario,
       round(s.quantidade, 2) as saldo_antes,
       round(s.quantidade + coalesce(sum(f.d) filter (where inv.ts is null or f.criado_em > inv.ts), 0), 2) as saldo_depois
  from public.saldo_estoque s
  join public.insumos i on i.id = s.insumo_id
  join public.lojas l on l.id = s.loja_id
  left join fix f on f.loja_id = s.loja_id and f.insumo_id = s.insumo_id
  left join inv on inv.loja_id = s.loja_id and inv.insumo_id = s.insumo_id
 where s.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
   and i.id in (select insumo_id from fix)
 group by i.nome, l.nome, inv.ts, s.quantidade
 order by i.nome, l.nome;


-- =====================================================================
-- PARTE 2 — APLICAR (só depois de conferir a Parte 1).
-- UM bloco só (do $$ … $$): roda como UM comando → grava TUDO ou NADA
-- (o editor do Supabase não honra begin/commit com tabela temporária).
-- =====================================================================
do $$
declare
  v_tenant uuid := 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5';
  k record; r record; q numeric; cm numeric; nq numeric; n int;
begin
  drop table if exists _fix; drop table if exists _aj;

  -- 1) lançamentos a corrigir
  create temp table _fix as
  select e.id, e.loja_id, e.insumo_id, e.criado_em,
         e.quantidade as q_old,
         case when lower(i.nome) = 'kit kat'       then e.quantidade * 24
              when lower(e.unidade_compra) = 'und' then e.quantidade / 12
              else e.quantidade * 8.4 / 9 end      as q_new,
         case when lower(i.nome) = 'kit kat'       then e.custo_unitario / 24
              when lower(e.unidade_compra) = 'und' then e.custo_unitario * 12
              else e.custo_unitario * 9 / 8.4 end  as c_new,
         case when lower(i.nome) = 'kit kat'       then 24
              when lower(e.unidade_compra) = 'und' then 0.5
              else 8.4 end                         as f_new
    from public.entradas_estoque e
    join public.insumos i on i.id = e.insumo_id
   where e.tenant_id = v_tenant
     and e.fornecedor_nome ~* 'yan torres'
     and ( (lower(i.nome) = 'kit kat' and e.custo_unitario > 50)
        or (lower(i.nome) = 'vinagre' and lower(e.unidade_compra) = 'und' and e.fator_conversao = 6)
        or (lower(i.nome) = 'vinagre' and e.fator_conversao = 9 and e.nfe_numero in ('1991/002','1992/002')) );
  select count(*) into n from _fix;
  if n = 0 then raise exception 'Nada a corrigir (já foi aplicado?)'; end if;

  -- 2) corrige os lançamentos
  update public.entradas_estoque e
     set quantidade = round(f.q_new, 4), custo_unitario = round(f.c_new, 6), fator_conversao = f.f_new
    from _fix f where e.id = f.id;

  -- 3) refaz o AJUSTE DE INVENTÁRIO (saldo pós-inventário continua = contado)
  create temp table _aj as
  with inv as (
    select v.loja_id, ii.insumo_id,
           (coalesce(v.data_final, v.data_inicial)::date + time '12:00')::timestamptz as ts
      from public.inventarios v
      join public.inventario_itens ii on ii.inventario_id = v.id and ii.qtd_contada is not null
     where v.tenant_id = v_tenant and v.status = 'encerrado'
       and ii.insumo_id in (select distinct insumo_id from _fix)
  ), inv2 as (
    select *, lag(ts) over (partition by loja_id, insumo_id order by ts) as ts_ant from inv
  )
  select x.loja_id, x.insumo_id, x.ts,
         coalesce((select sum(quantidade) from public.entradas_estoque a where a.tenant_id = v_tenant and a.loja_id = x.loja_id and a.insumo_id = x.insumo_id and a.tipo = 'ajuste' and a.criado_em = x.ts), 0)
       - coalesce((select sum(quantidade) from public.saidas_estoque  a where a.tenant_id = v_tenant and a.loja_id = x.loja_id and a.insumo_id = x.insumo_id and a.tipo = 'ajuste' and a.criado_em = x.ts), 0) as aj_old,
         coalesce((select sum(f.q_new - f.q_old) from _fix f where f.loja_id = x.loja_id and f.insumo_id = x.insumo_id and f.criado_em <= x.ts and (x.ts_ant is null or f.criado_em > x.ts_ant)), 0) as delta
    from inv2 x;

  delete from public.entradas_estoque a using _aj j
   where a.tenant_id = v_tenant and a.loja_id = j.loja_id and a.insumo_id = j.insumo_id and a.tipo = 'ajuste' and a.criado_em = j.ts and j.delta <> 0;
  delete from public.saidas_estoque a using _aj j
   where a.tenant_id = v_tenant and a.loja_id = j.loja_id and a.insumo_id = j.insumo_id and a.tipo = 'ajuste' and a.criado_em = j.ts and j.delta <> 0;

  insert into public.entradas_estoque (tenant_id, insumo_id, loja_id, quantidade, custo_unitario, tipo, observacao, criado_em)
  select v_tenant, j.insumo_id, j.loja_id, round(j.aj_old - j.delta, 4),
         case when (select lower(nome) from public.insumos where id = j.insumo_id) = 'kit kat' then 6 else 4.833333 end,
         'ajuste', 'Ajuste de inventário (corrigido: conversão YAN TORRES)', j.ts
    from _aj j where j.delta <> 0 and (j.aj_old - j.delta) > 0;
  insert into public.saidas_estoque (tenant_id, insumo_id, loja_id, quantidade, tipo, motivo, criado_em)
  select v_tenant, j.insumo_id, j.loja_id, round(j.delta - j.aj_old, 4),
         'ajuste', 'Ajuste de inventário (corrigido: conversão YAN TORRES)', j.ts
    from _aj j where j.delta <> 0 and (j.aj_old - j.delta) < 0;

  -- 4) saldo = atual + correção pós-inventário (igual à prévia)
  update public.saldo_estoque s
     set quantidade = s.quantidade + d.dpos, atualizado_em = now()
    from (
      select f.loja_id, f.insumo_id,
             sum(f.q_new - f.q_old) filter (where m.ts is null or f.criado_em > m.ts) as dpos
        from _fix f
        left join (select loja_id, insumo_id, max(ts) as ts from _aj group by 1, 2) m
          on m.loja_id = f.loja_id and m.insumo_id = f.insumo_id
       group by 1, 2
    ) d
   where s.tenant_id = v_tenant
     and s.loja_id = d.loja_id and s.insumo_id = d.insumo_id and coalesce(d.dpos, 0) <> 0;

  --    custo médio refeito (mesma regra do Recalcular), só nas lojas corrigidas
  for k in select distinct loja_id, insumo_id from _fix where loja_id is not null
  loop
    q := 0; cm := 0;
    for r in
      select criado_em, true as ent, coalesce(quantidade,0) as qq, coalesce(custo_unitario,0) as vv
        from public.entradas_estoque where tenant_id = v_tenant and loja_id = k.loja_id and insumo_id = k.insumo_id
      union all
      select criado_em, false, coalesce(quantidade,0), 0
        from public.saidas_estoque  where tenant_id = v_tenant and loja_id = k.loja_id and insumo_id = k.insumo_id
      order by 1 asc
    loop
      if r.ent then
        if r.qq = 0 then cm := r.vv;
        else nq := q + r.qq; cm := case when nq > 0 then (q*cm + r.qq*r.vv)/nq else cm end; q := nq; end if;
      else q := greatest(0, q - r.qq); end if;
    end loop;
    update public.saldo_estoque set custo_medio = round(cm, 6), atualizado_em = now()
     where tenant_id = v_tenant and loja_id = k.loja_id and insumo_id = k.insumo_id and cm > 0;
  end loop;

  -- 5) vínculo do Kit Kat (cód 872) → display de 24 (próximas notas entram certas)
  update public.vinculos_nfe
     set fator_conversao = 24
   where tenant_id = v_tenant
     and codigo_nfe = '872'
     and insumo_id in (select id from public.insumos where tenant_id = v_tenant and lower(nome) = 'kit kat');

  drop table _fix; drop table _aj;
end $$;


-- =====================================================================
-- PARTE 3 — CONFERÊNCIA (depois do commit): saldo e custo médio por loja
-- =====================================================================
select i.nome as item, l.nome as loja, round(s.quantidade, 2) as saldo, round(s.custo_medio, 4) as custo_medio
  from public.saldo_estoque s
  join public.insumos i on i.id = s.insumo_id
  join public.lojas l on l.id = s.loja_id
 where s.tenant_id = 'ad59e5f2-1c1f-4abb-b816-44a1c4f9cfb5'
   and lower(i.nome) in ('kit kat', 'vinagre')
 order by i.nome, l.nome;
