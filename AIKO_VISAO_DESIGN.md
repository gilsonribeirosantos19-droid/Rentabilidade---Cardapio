# Aiko — Visão de Design (se eu fosse o dono)

> Documento de visão. Opinião de produto/design para o Aiko evoluir de **"bom"** (≈8/10) para **"claramente profissional"** (≈9,5/10), sem reconstruir — refinando o que já existe.
> Princípio-guia: **ERP de restaurante com cara de SaaS moderno**, não de sistema legado. Usuário-alvo: **dono leigo + gerente + operador**. Multi-tenant.

---

## 1. Filosofia (os 5 princípios)

1. **Menos é mais** — menos cores, menos sombras, menos cards decorativos. **Mais dado, mais espaço em branco.** (Já é o lema do design-system.css — manter firme.)
2. **Consistência acima de tudo** — o que parece amador não é a cor, é a **mistura**. Um componente = um jeito, em todas as telas.
3. **Hierarquia clara** — o olho tem que saber em 1 segundo: o que é título, o que é dado, o que é ação.
4. **Didático** — o usuário é leigo. Tooltips, textos de ajuda, estados vazios que ensinam ("Nenhuma nota ainda. Clique em + para começar").
5. **Confiança** — números alinhados, fontes mono pra dinheiro, nada de "tremido". ERP é dinheiro; tem que passar segurança.

---

## 2. Identidade

- **Marca:** sempre **Aiko** (nunca o nome do cliente — é multi-tenant).
- **Logo:** o ícone de "folha/gráfico" laranja + "Aiko" / "sistema". Manter, mas padronizar tamanho e espaçamento (hoje varia por tela).
- **Tom de voz:** direto, claro, amigável. Em português, sem jargão. Mensagens curtas ("Salvo!", "3 itens sem vínculo").

---

## 3. Cores (sistema de tokens)

Manter a base atual, com hierarquia mais disciplinada. **Laranja é só pra AÇÃO e estado ativo — não espalhar.**

```
/* Marca */
--primary:        #F97316   /* laranja — ação principal, item ativo, foco */
--primary-hover:  #EA6C00
--primary-soft:   #FFF7ED   /* fundo de destaque suave, chips */

/* Estrutura (escala fria de cinza-azulado) */
--navy:           #1E293B   /* sidebar (um tom mais rico que o atual) */
--text-1:         #0F172A   /* títulos / dado forte */
--text-2:         #475569   /* texto secundário */
--text-3:         #94A3B8   /* rótulos, placeholders, "—" */
--border:         #E2E8F0
--border-soft:    #F1F5F9
--bg-app:         #F8FAFC   /* fundo do app */
--bg-card:        #FFFFFF

/* Semânticas (usar SÓ pelo significado, nunca decorativo) */
--success:  #16A34A   (soft #F0FDF4)   /* ok, dentro da meta, vinculado */
--warning:  #F59E0B   (soft #FFFBEB)   /* atenção, estoque baixo */
--danger:   #DC2626   (soft #FEF2F2)   /* erro, acima da meta, crítico */
--info:     #2563EB   (soft #EFF6FF)   /* informativo, neutro */
```

**Regra de ouro das cores:** numa tela típica, 90% é neutro (cinzas + branco), o laranja aparece em **1–2 lugares** (o botão principal + o item ativo do menu). Semânticas só onde têm significado (semáforo do CMV, badge de erro). É isso que separa "profissional" de "árvore de natal".

---

## 4. Tipografia

- **UI:** Inter (400/500/600/700). Já é.
- **Números / dinheiro / código:** DM Mono. Já é — **dinheiro SEMPRE em mono e alinhado à direita.**
- **Escala (rígida, sem improviso):**
  - Título de página: 18–20px / 800
  - Título de seção: 15px / 700
  - Rótulo (UPPERCASE): 10–11px / 600, `letter-spacing .05em`, cor text-3
  - Corpo / dado: 13px / 400–600
  - Auxiliar: 11–12px / 400, text-3
- **Caixa do texto:** **dado em caixa normal** ("Salmão Fresco"); **rótulo/cabeçalho em MAIÚSCULA**. (DANFE é exceção — mantém a descrição do fornecedor como veio.)

---

## 5. Espaçamento (régua de 4px)

Tudo múltiplo de **4**: `4, 8, 12, 16, 24, 32`. O que entrega "feito em casa" é padding fora do compasso (um 7px aqui, um 13px ali). Régua fixa = ritmo profissional.

- Raio de canto: **8px** (campos/botões/cards), 12–14px (cards grandes/modais).
- Sombra: quase nenhuma. Card = `0 1px 2px rgba(15,23,42,.04)`. Sombra forte só em modal/dropdown flutuante.

---

## 6. Componentes (a "biblioteca" — fonte única no design-system.css)

| Componente | Padrão |
|---|---|
| **Botão primário** | Laranja sólido (modelo A já escolhido). 1 por tela. |
| **Botão secundário** | Contorno branco (`btn-ghost`). |
| **Botão perigo** | Contorno vermelho, preenche no hover (`btn-danger`). |
| **Campo (input/select)** | Altura 36–38px, borda `--border`, foco laranja. |
| **Barra de filtros** | `.ds-filterbar` com rótulo em cima (já padronizada). |
| **Interruptor** | `.ds-switch` laranja (no lugar de checkbox em toggles). |
| **Tabela** | Cabeçalho claro (`#EEF2F7`, texto escuro), zebra sutil no hover, números à direita em mono, **densidade confortável** (linha ~38–40px). |
| **Badge / chip** | Pílula, cor semântica suave (fundo soft + texto da cor). |
| **Modal** | Overlay `rgba(15,23,42,.45)`, card branco raio 14, header com título + ✕, fecha no Esc/clique fora. |
| **Estado vazio** | Ícone leve + frase que ensina + botão de ação. |
| **Toast** | Canto inferior direito, verde (ok) / vermelho (erro), some sozinho. |

> **Decisão de dono:** TODO componente mora no `design-system.css`. Tela nunca redefine botão/campo inline. (Hoje a fiscal fazia isso — já corrigido. Manter a disciplina: mexeu numa tela, centraliza.)

---

## 7. Layout

```
┌──────────┬──────────────────────────────────────────────┐
│          │  TOPBAR: contexto + [Loja ▾] [Tenant]  [user]│
│ SIDEBAR  ├──────────────────────────────────────────────┤
│ 220px    │  Título da página            [ações da página]│
│ navy     │                                               │
│ logo     │  ┌ barra de filtros ─────────────────────┐   │
│ grupos   │  └────────────────────────────────────────┘   │
│ + itens  │  ┌ conteúdo (tabela / cards / gráfico) ───┐   │
│          │  └────────────────────────────────────────┘   │
└──────────┴──────────────────────────────────────────────┘
```

- **Sidebar** navy, 220px, **colapsável** (vira 64px só ícones — ganha espaço em telas de tabela larga). Item ativo: faixa/realce laranja.
- **Topbar** fina, com o **seletor de Loja** sempre visível (multi-loja é central) + usuário + sino de alertas.
- **Conteúdo**: título + ações à direita, barra de filtros padrão, depois o dado.

---

## 8. Navegação / Arquitetura da Informação (como agrupar o menu)

Hoje o menu está bom; eu reorganizaria em **domínios claros** (o usuário pensa por tarefa, não por tela):

- **🏠 Início** — o cockpit (dashboard de verdade, ver §9).
- **📦 Operação** — Estoque (Saldo, Movimentação, Inventário), Compras/Sugestão, Produção (PCP), Porcionamento.
- **🧾 Fiscal** — Monitor NF-e, Entradas Processadas, **Notas de Serviço** (futuro).
- **📊 Análises** — Fechamento de Custo, CMV, Rendimento, Relatórios, Divergências.
- **🍽️ Cardápio** — Fichas Técnicas, Engenharia de Cardápio (futuro), Precificação.
- **🛒 Vendas** — PDV (Dashboard, Relatórios, Importação).
- **🗂️ Cadastros** — Insumos, Fornecedores, Lojas.
- **⚙️ Configurações** — Geral, Usuários, Permissões, Parâmetros.

Princípio: **5–8 grupos**, cada um com 2–5 itens. Mais que isso = decisão difícil pro usuário.

---

## 9. Telas (o que eu mudaria)

### 🏠 Início / Cockpit (a maior mudança)
Hoje falta uma "casa" forte. Eu faria um **dashboard que responde "como está meu restaurante hoje?"** em 5 segundos:
- **4 KPIs no topo:** CMV % (com semáforo), Valor em Estoque (R$), Compras do Mês, Faturamento (quando o PDV ligar).
- **Alertas acionáveis:** "3 notas sem vínculo", "5 itens em estoque crítico", "Inventário do mês não fechado". Cada um clica e leva direto.
- **Mini-gráfico:** CMV dos últimos meses.
- **Por loja:** mini-tabela comparando as filiais (quem está com CMV alto).

### As telas que já trabalhamos (manter + polir)
- **Estoque, Fiscal, CMV, Fechamento, Porcionamento, Rendimento, PDV** — **barra de filtros padrão já aplicada**. Manter. Polir estados vazios e densidade.
- **Insumos / Fornecedores** — estilo compacto próprio (já limpo). Manter.
- **DANFE** (Visualizar/Imprimir) — pronto. Manter.

### Portal do Gerente (loja.html)
- É a cara do Aiko pra quem está na operação (gerente). Hoje tem CSS próprio. Eu **unificaria com o design-system** aos poucos, pra não ser "outro sistema". Foco: simples, botões grandes, pouca poluição (gerente é rápido).

---

## 10. Estados (o detalhe que separa amador de pro)

- **Carregando:** skeleton (linhas cinzas pulsando), não "Carregando..." seco.
- **Vazio:** ícone + frase que ensina + ação. Ex.: *"Nenhum insumo cadastrado. Cadastre o primeiro para começar."*
- **Erro:** mensagem clara em português + o que fazer ("Tente de novo" / "Fale com o suporte").
- **Sucesso:** toast curto. Sem modal pra confirmar o óbvio.

---

## 11. Didático (porque o usuário é leigo)

- **Tooltips "?"** nos termos técnicos (CMV, custo médio, ciência da NF-e).
- **Microcopy que explica:** abaixo de campos importantes, uma linha cinza ("Custo médio = média ponderada das compras").
- **Onboarding leve:** primeira vez numa tela, um balão apontando "comece por aqui".

---

## 12. Responsivo / Mobile

- **Admin (dono):** desktop em primeiro lugar (é onde se gerencia).
- **Portal do Gerente:** **precisa funcionar bem no celular** (gerente conta estoque com o telefone na mão). Layout em coluna, botões grandes, toque fácil.

---

## 13. Resumo: o que MUDA vs o que MANTÉM

**✅ MANTÉM (já está bom):**
- Laranja + Inter + DM Mono + sidebar navy.
- Filosofia "menos cores, mais dado".
- Barra de filtros padrão (`.ds-filterbar`), botões modelo A, design-system.css como fonte única.
- Telas de Estoque/Fiscal/CMV/Fechamento/DANFE.

**🔁 EVOLUI (meu plano como dono):**
1. **Cockpit/Início de verdade** (KPIs + alertas acionáveis) — maior ganho.
2. **Disciplina total de tokens** (cor/espaço/tipografia numa régua) e **componentes só no design-system.css**.
3. **Sidebar colapsável** + menu reagrupado por domínio.
4. **Estados** (vazio/carregando/erro) padronizados e didáticos.
5. **Portal do Gerente** unificado com o design-system + 100% mobile.
6. **Caixa normal nos dados** (não tudo maiúsculo) + rótulos em maiúscula.
7. **Toque de "delight"**: estados vazios amigáveis, microcopy que ensina, semáforos claros.

**Filosofia final:** o Aiko não precisa de revolução — precisa de **acabamento obsessivo e consistência**. É o que transforma um bom sistema num produto que o cliente **confia e tem orgulho de mostrar**.

---

*Documento de visão — Aiko. Para discussão e priorização. Construir por partes, incremental, sem quebrar o que está no ar.*
