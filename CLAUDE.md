# Projeto: Rentabilidade Cardápio — Sushi PN

## Visão Geral
App web de **gestão de rentabilidade e fichas técnicas** para o Sushi Ponta Negra.
Stack: HTML/CSS/JS puro + Supabase (sem framework, sem servidor).
Deploy: Vercel (automático via GitHub push).

---

## Configurações

| Item | Valor |
|------|-------|
| URL do app | https://rentabilidade-cardapio.vercel.app |
| Supabase URL | https://trczpnjidqfippbfxtpe.supabase.co |
| Supabase Key | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyY3pwbmppZHFmaXBwYmZ4dHBlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc3OTIxMSwiZXhwIjoyMDkzMzU1MjExfQ.jzKBKgFu7qMyM-LAICYeThLcUkBnTfxe9xrr_79Je7g |
| Tenant ID | 00000000-0000-0000-0000-000000000001 |
| GitHub | https://github.com/gilsonribeirosantos19-droid/Rentabilidade---Cardapio |

---

## Estrutura do Banco (Supabase)

### Tabela: `insumos`
- `id` uuid PK
- `tenant_id` uuid
- `nome` text
- `unidade_medida` text
- `unidade_compra` text
- `preco_compra` numeric — preço por kg/litro
- `rendimento_pct` numeric — % de aproveitamento (ex: 85)
- `ativo` boolean
- `created_at` timestamp

### Tabela: `fichas_tecnicas`
- `id` uuid PK
- `tenant_id` uuid
- `nome` text
- `categoria` text — temaki, sushi, hot, uramaki, sashimi, combo, prato, bebida, entrada, sobremesa, outros
- `rendimento_porcoes` integer
- `modo_preparo` text (nullable)
- `observacoes` text (nullable)
- `status` text — ativa, rascunho, arquivada
- `versao_atual` integer (default 1)
- `preco_venda` numeric(10,2) (nullable)
- `insumo_vinculado_id` uuid FK → insumos(id) (nullable) — para fichas de processados
- `rendimento_receita_g` numeric(10,3) (nullable) — rendimento em gramas da receita processada
- `created_at` timestamp
- `atualizado_em` timestamp

### Tabela: `itens_ficha`
- `id` uuid PK
- `ficha_id` uuid FK → fichas_tecnicas(id)
- `insumo_id` uuid FK → insumos(id)
- `quantidade_g` numeric — quantidade em gramas
- `ordem` integer

---

## Arquivos do Projeto

### `insumos.html`
- Cadastro de insumos (matéria-prima)
- CRUD completo com Supabase
- Campos: nome, unidade_medida, unidade_compra, preco_compra, rendimento_pct, ativo

### `fichas_tecnicas.html`
- Cadastro de fichas técnicas com ingredientes
- Calcula custo automaticamente pela fórmula:
  `custo = preco_compra / (rendimento_pct/100) / 1000 * quantidade_g`
- Indicadores no modal de visualização: Preço / CMV / Markup / Margem
- Semáforo CMV: verde ≤30%, amarelo ≤38%, vermelho >38%
- **Ficha de processado**: vincula a um insumo existente e atualiza o preço/kg automaticamente ao salvar
- Campo rendimento_receita_g para calcular custo real do processado

---

## Padrão de Código

### Função API (CRÍTICO)
```javascript
async function api(endpoint, opts={}) {
  const method = (opts.method||'GET').toUpperCase();
  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer '+SUPA_KEY,
  };
  // Content-Type SOMENTE quando há body (nunca no DELETE!)
  if (opts.body) headers['Content-Type']='application/json';
  if (opts.prefer) headers['Prefer']=opts.prefer;
  else if (method==='POST') headers['Prefer']='return=representation';
  else if (method==='PATCH') headers['Prefer']='return=representation';

  const res = await fetch(`${SUPA_URL}/rest/v1/${endpoint}`,
    {method, headers, body: opts.body||undefined});

  if (!res.ok){
    let msg=res.statusText;
    try{const j=await res.json();msg=j.message||j.error||msg;}catch{}
    throw new Error(`[${res.status}] ${msg}`);
  }
  const ct=res.headers.get('content-type')||'';
  if (ct.includes('application/json')){const t=await res.text();return t?JSON.parse(t):[];}
  return [];
}
```

### Regras importantes
- **DELETE nunca deve ter `Content-Type` ou `body`** — causa erro 400 no Supabase
- **PATCH de insumos não tem coluna `atualizado_em`** — não enviar esse campo
- Sempre usar `prefer: 'return=minimal'` no DELETE e PATCH sem necessidade de retorno
- Sempre filtrar por `tenant_id=eq.${TENANT_ID}` nas queries

### Design System
```css
--bg1:#0d0f14; --bg2:#161820; --bg3:#1e2030;
--border2:#252840;
--teal:#00d4aa; --teal2:#00b890; --teal-dim:rgba(0,212,170,.12);
--amber:#f59e0b; --red:#ef4444;
--text1:#f0f2ff; --text2:#94a3c4; --text3:#5a6080;
```
- Font: Inter + DM Mono (números/código)
- Sidebar escura com logo "Sushi PN / rentabilidade"

---

## Telas Planejadas (não construídas ainda)

- [ ] `dashboard.html` — visão geral métricas
- [ ] `precificacao.html` — simulador de preços antes de apontar na ficha
- [ ] `engenharia_cardapio.html` — matriz BCG (estrela/vaca/abacaxi/interrogação)
- [ ] `cmv.html` — CMV teórico x real
- [ ] `rendimento.html` — controle de rendimento
- [ ] `simulador.html` — simulador de cenários
- [ ] `fornecedores.html` — cadastro de fornecedores
- [ ] `alertas.html` — alertas de variação de custo
- [ ] `configuracoes.html` — configurações do tenant

---

## Fluxo de Deploy

1. Edita arquivos localmente
2. `git add .`
3. `git commit -m "descrição"`
4. `git push`
5. Vercel detecta e publica automaticamente em ~1-2 minutos

---

## Observações Importantes

- O projeto é **multi-tenant** mas por ora opera com um único tenant fixo
- Custo calculado sempre em **R$/kg** — quantidade dos ingredientes sempre em gramas
- Fichas de **processados** (Shari, molhos, etc.) vinculam a um insumo e atualizam o preço/kg automaticamente
- O campo `unidade_medida` dos insumos pode ser: kg, g, litro, ml, un
