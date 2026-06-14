# Roteiro de Validação — Sistema Aiko

> Objetivo: confirmar na prática que os fluxos críticos funcionam, antes de confiar pra clientes.
> Tempo: ~15-20 min. **Faça os testes de criar/apagar no tenant "Ambiente de Testes"** (login do Gilson), NUNCA no Mori — pra não sujar dados reais.
>
> Como usar: siga cada passo, compare com o "✅ Esperado". Se algo NÃO bater, anote o passo e me avise.

---

## Parte 0 — Isolamento entre clientes (segurança) 🔒
*O mais importante num sistema multi-cliente.*

1. [ ] Logar como **Ambiente de Testes** → abrir **Insumos**.
   ✅ Esperado: vê os insumos do teste (poucos). **NÃO** vê os 267 do Mori.
2. [ ] Sair, logar como **Mori** (djalma@izakayamori.com) → abrir **Insumos**.
   ✅ Esperado: vê os 267 do Mori. **NÃO** vê os do teste.
3. [ ] No portal/topo, confirmar o **nome certo do cliente** (não "Sushi Ponta Negra").
   ✅ Esperado: cada login mostra o nome do seu próprio tenant.

> ⚠️ Se um cliente ver dado do outro: **PARE e me avise** — é falha de isolamento (grave).

---

## Parte 1 — Cadastros e cálculo de custo 🧮
*No Ambiente de Testes.*

4. [ ] **Insumos** → cadastrar um insumo (ex: "Teste Arroz", R$ 10/kg, rendimento 100%).
   ✅ Esperado: salva e aparece na lista.
5. [ ] **Fichas técnicas** → criar uma ficha com esse insumo (ex: 100g), rendimento 1 porção, preço de venda.
   ✅ Esperado: o **custo calcula sozinho**; aparecem CMV / margem / markup.
6. [ ] Abrir a ficha e conferir o **Custo por porção**.
   ✅ Esperado: bate com a conta (100g de R$10/kg = R$1,00). O custo é **por porção**, não o total da receita.

---

## Parte 2 — Estoque: entrada e saída 📦
*No Ambiente de Testes.*

7. [ ] **Estoque → Entradas** → lançar uma entrada do "Teste Arroz" (ex: 10 kg, custo R$ 10/kg).
   ✅ Esperado: o **Saldo** sobe 10 kg e o **custo médio** fica R$ 10/kg.
8. [ ] Lançar uma 2ª entrada com preço diferente (ex: 10 kg a R$ 14/kg).
   ✅ Esperado: saldo = 20 kg, custo médio = **R$ 12,00** (média ponderada).
9. [ ] **Estoque → Saídas** → dar baixa de 5 kg (tipo "consumo").
   ✅ Esperado: saldo cai pra 15 kg; custo médio continua R$ 12,00.

---

## Parte 3 — Relatórios e indicadores coerentes 📊

10. [ ] **Relatórios → Movimentação** do "Teste Arroz".
    ✅ Esperado: entradas (20) − saídas (5) = saldo (15). Os números **batem** com o saldo.
11. [ ] **Sugestão de Compras** (Estoque).
    ✅ Esperado: como houve consumo (saída tipo "consumo"), o item aparece com sugestão. *(Saída "manual" antiga não contava; agora o portal grava "consumo".)*
12. [ ] **Dashboard** → card de CMV.
    ✅ Esperado: se NÃO há faturamento lançado, mostra **"sem dados"** / "—" (não um número falso). Não mostra valor em estoque disfarçado de CMV.
13. [ ] **Inventário** (Estoque) → criar um inventário, contar, **encerrar**.
    ✅ Esperado: ao encerrar, o saldo se ajusta pela contagem; o relatório de Movimentação enxerga o inventário encerrado.

---

## Parte 4 — Telas que mexemos hoje (conferência visual) 👀

14. [ ] **Insumos, Produtos, Fiscal, Fichas, Configurações** → olhar o **cabeçalho das tabelas**.
    ✅ Esperado: cabeçalho **claro com texto escuro legível** (não texto escuro sobre fundo azul-marinho).
15. [ ] **Qualquer tela com tabela** (Estoque, Relatórios) → confirmar que as **tabelas renderizam** com texto e valores.
    ✅ Esperado: tudo aparece normal (validação da centralização do `esc`).
16. [ ] **Configurações → Parâmetros**.
    ✅ Esperado: os que funcionam estão normais; os "enfeite" estão **apagados com tag "Em breve"**; PCP/Porcionamento/Ficha/CMV/Dashboard têm a tag no título.

---

## Parte 5 — Limpeza do teste 🧹

17. [ ] No Ambiente de Testes, **apagar** a ficha, o insumo "Teste Arroz" e as entradas/saídas que criou (ou deixar — é sandbox).

---

## Resultado

- [ ] **Tudo bateu** → pode confiar nos fluxos críticos. 🎉
- [ ] **Algo falhou** → anotar o número do passo e o que aconteceu, e me avisar.
