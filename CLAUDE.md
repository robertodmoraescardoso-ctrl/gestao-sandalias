# CLAUDE.md — Contexto permanente do projeto Beblue

> Lido automaticamente pelo Claude Code no início de cada sessão.
> Leia também `ESTADO-ATUAL-E-PENDENCIAS.md` e `LICOES-APRENDIDAS.md`.
> **Nada aqui substitui verificação.** Antes de propor mudança, confirme o
> estado real no banco e no repositório. Este arquivo já esteve errado antes.

---

## 1. Com quem você está falando

- Roberto de Moraes Cardoso Filho, dono da Beblue. Estudante de Engenharia
  Civil, **sem formação em programação**.
- Responda sempre em **português**, linguagem simples, passo a passo.
- Ele **não tem terminal, Node.js nem npm na máquina**. Nunca proponha
  `npm install`, `npm run build` ou comando de terminal como tarefa dele.
- Prefere **a solução mais simples que funciona** à mais elegante.
- Antes de mudar código: **investigue e explique a causa raiz**.
- Avise **custo e risco** antes de qualquer decisão.
- Sem emoji. Terminologia direta, tabelas quando ajudarem.

---

## 2. Como trabalhar (combinado em 28/10/2026)

**Você publica, ele não.** Com o app do Claude instalado no repositório, o
push funciona. Escreva o arquivo, valide que compila, commite na `main` e
avise o que mudou e onde conferir. Não devolva arquivo para ele colar à mão,
a não ser que o push esteja indisponível.

**Banco é produção e não tem ambiente de teste.** Antes de qualquer escrita
em `produtos`, `pedidos`, estoque ou financeiro:

1. Leia o schema real primeiro. Nunca assuma pelo repositório.
2. Mostre a ele o que vai mudar e quantas linhas serão afetadas.
3. Salve cópia das linhas afetadas numa tabela de backup antes de mexer.
4. Espere aprovação.

**Não peça a ele para rodar SQL** se o conector do Supabase estiver ativo.
Se não estiver, avise no começo da sessão e aí sim gere o bloco pronto.

**Mantenha a documentação viva.** Ao fim de sessão relevante, atualize
`ESTADO-ATUAL-E-PENDENCIAS.md` e `LICOES-APRENDIDAS.md` e commite junto.

---

## 3. O negócio

Revenda de sandálias e calçados em Recife-PE, MEI, CNAE 4782-2/01.
Marca Beblue (também divulgada como Betshoes), produto "Blue".
Fornecedor: fábrica Blue, em Campina Grande-PB.

Grades de tamanho: 36-37, 37-38, 39-40, 41-42, 43-44 — pares, não
numeração individual.

Pagamento por Pix, BR Code **tipo 11** (formato Inter). Retirada na
Tamarineira; entrega R$10 até 10 km e R$20 até 20 km, distância em linha
reta por Haversine.

Canais: loja online, venda manual por WhatsApp/Instagram e totem em arena
esportiva (repasse de 15% ao dono da arena).

> Custos por modelo, margens, estado financeiro e regras de retirada de
> sócio **não ficam neste arquivo** — este repositório é público. Esses
> dados vêm por anexo na sessão. Veja a seção 7.

---

## 4. Arquitetura

Dois front-ends independentes sobre **um único banco Supabase**.

| Sistema | Repositório | Hospedagem | Stack |
|---|---|---|---|
| Loja do cliente | `beblue-loja` | GitHub Pages — `beblue.shop` | HTML/JS puro, sem build |
| Painel de gestão | `gestao-sandalias` | Vercel — `gestao-sandalias.vercel.app` | React + Vite + Tailwind |
| Painel antigo (morto) | `beblue-painel` | GitHub Pages | **Não usar, deve ser arquivado** |

Supabase: projeto "Beblue", ID `czocwpxhdztdoslmaajg`.
Auth do painel: Supabase Auth, `signInWithPassword`.

A loja grava pedidos via função `criar_pedido`. O painel lê por RPCs
`security definer` que devolvem só agregados, nunca dado pessoal cru.

---

## 5. Banco de dados

### `produtos` — confirmado no banco em 28/10/2026

`id`, `cod text`, `nome text`, `preco numeric`, `tamanhos jsonb`,
`estoque jsonb` (objeto por grade, ex.: `{"41-42": 5}`), `img text`,
`imagens jsonb`, `descricao text`, `ativo boolean`, custos, `criado_em`.

> **O estoque é jsonb por grade, não um número inteiro.** Qualquer código
> que trate estoque como `int` está desatualizado.

### `pedidos`

Contém **dado pessoal do cliente** — acesso restrito a `authenticated`.
A coluna `itens` é array JSONB com `cod`, `nome`, `qtd`, `preco_unit`,
`produto_id`. Consulta de venda por produto **exige** `jsonb_array_elements`
em lateral join; não há join direto.

### Tabelas gerenciais (RLS, só `authenticated`)

`fornecedores`, `pedidos_compra`, `pedido_compra_itens`, `recebimentos`,
`recebimento_itens`, `contas_pagar`, `despesas`, `retiradas_socios`,
`ativacoes`, `ativacao_itens`.

### Funções conhecidas

`criar_pedido`, `fn_dashboard`, `fn_reposicao`, `fn_top_produtos`,
`fn_vendas_por_dia`, `fn_vendas_lista`, `fn_sugestao_retirada`,
`fn_indicadores_gestor`.

> `criar_pedido` **não está versionada em migração nenhuma** — existe só
> dentro do banco. Mesma situação de outras funções. Pendência aberta.

### Permissões

- Tabelas gerenciais: RLS liberando apenas `authenticated`.
- Funções gerenciais: `revoke execute from public, anon` + `grant execute
  to authenticated, service_role`.
- `produtos`: leitura pública **por coluna**. Colunas de custo ficam fora.

---

## 6. As migrações do repositório estão obsoletas

`supabase/migrations/0001_init.sql` descreve uma tabela `produtos` com
`id uuid`, `estoque_atual int`, `custo_medio`, `sku`, `preco_venda`.
**Essa tabela não existe mais** — foi recriada em 10/09/2026 com outro
schema (seção 5). As migrações 0001 a 0004 ficam como registro histórico.

Em 28/10/2026, `select pg_get_functiondef(oid) from pg_proc where proname =
'trg_recebimento_item'` devolveu **zero linhas**: o gatilho de recebimento
descrito na 0001 não existe no banco com esse nome. Investigação em aberto.

**Consequência prática: não deduza o estado do banco lendo este
repositório. Leia o banco.**

---

## 7. O que não está aqui

Este repositório é público. Custos por modelo, margens, estado financeiro,
regras de retirada de sócio e leituras comerciais ficam fora e chegam por
anexo no início da sessão. Se precisar deles e não tiverem sido anexados,
peça ao Roberto.

---

## 8. Regras invioláveis

1. **Nunca rode migração destrutiva sem inspecionar o schema existente.**
   Já destruiu a tabela `produtos` em produção uma vez.
2. **Este banco é produção.** Não existe ambiente de teste.
3. **`pedidos` tem dado pessoal.** Nenhuma política permissiva, nenhum
   acesso `anon`, nenhuma RPC que devolva dado cru de cliente.
4. **Ao trocar o retorno de uma função**, `DROP FUNCTION IF EXISTS` antes do
   `CREATE FUNCTION`, na mesma migração.
5. **Revogar de `anon` não basta.** Revogue de `public, anon` e confira com
   `has_function_privilege('anon', '<assinatura>', 'execute')`.
6. **RLS libera a tabela inteira, não coluna.** Para esconder custo, use
   grant por coluna.
7. Não proponha fluxo que dependa de terminal local.
