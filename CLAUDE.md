# CLAUDE.md — Contexto permanente do projeto Beblue

> Este arquivo é lido automaticamente pelo Claude Code no início de cada sessão.
> Leia também `ESTADO-ATUAL-E-PENDENCIAS.md` e `LICOES-APRENDIDAS.md` na mesma pasta.
> **Nada aqui substitui verificação.** Antes de propor mudança, confirme o estado real no banco e no repositório.

---

## 1. Com quem você está falando

- Roberto de Moraes Cardoso Filho, dono da Beblue. Estudante de Engenharia Civil, **sem formação em programação**.
- Responda sempre em **português**, linguagem simples, passo a passo.
- **Entregue arquivos completos para substituição**, nunca diffs ou "altere a linha 47". Ele troca arquivos pela interface web do GitHub.
- Ele **não tem terminal, Node.js nem npm na máquina**. Não proponha `npm install`, `npm run build`, scripts locais ou comandos de terminal como parte da solução dele.
- Prefere **a solução mais simples que funciona** à mais elegante.
- Antes de mudar código: **investigue e explique a causa raiz**. Ele quer entender o porquê.
- Avise **custo e risco** antes de qualquer decisão (serviço pago, migração destrutiva, mudança de fluxo).
- Sem emoji. Terminologia técnica direta, tabelas quando ajudar.

---

## 2. O negócio

| Item | Valor |
|---|---|
| Marca | Beblue (também divulgada como Betshoes), marca de produto "Blue" |
| Atividade | Revenda de sandálias e calçados, Recife-PE |
| Formalização | MEI, CNAE 4782-2/01 (comércio varejista de calçados), aberto em out/2026 |
| Fornecedor | Fábrica "Blue", Campina Grande-PB |
| Grades de tamanho | 36-37, 37-38, 39-40, 41-42, 43-44 (pares, não numeração individual) |
| Pagamento | Pix, chave +5581973425000 (ROBERTO DE M C FILHO), BR Code **tipo 11** (formato Inter) |
| WhatsApp | +55 81 97342-5000 |
| Retirada | Rua Ibiapaba, 90 — Tamarineira, Recife |
| Entrega | R$10 até 10 km, R$20 até 20 km (distância em linha reta a partir da Tamarineira, fórmula de Haversine) |

Canais de venda: loja online, venda manual por WhatsApp/Instagram e totem de autoatendimento em arena esportiva (repasse de 15% ao dono da arena).

---

## 3. Arquitetura

Dois front-ends independentes sobre **um único banco Supabase**.

| Sistema | Repositório | Hospedagem | Stack |
|---|---|---|---|
| Loja do cliente | `beblue-loja` | GitHub Pages — `beblue.shop` | HTML/JS puro, sem framework e sem build |
| Painel de gestão interno | `gestao-sandalias` (`github.com/robertodmoraescardoso-ctrl/gestao-sandalias`) | Vercel — `gestao-sandalias.vercel.app` | React + Vite + Tailwind |
| Painel antigo (morto) | `beblue-painel` | GitHub Pages | HTML puro — **não usar, deve ser arquivado** |

Supabase:

| Item | Valor |
|---|---|
| Projeto | "Beblue" |
| Project ID | `czocwpxhdztdoslmaajg` |
| URL | `https://czocwpxhdztdoslmaajg.supabase.co` |
| Chave publishable | `sb_publishable_qpOz9Hgxl2eQXyL3HCepaA_vlRt2CR3` |
| Auth do painel | Supabase Auth, `signInWithPassword` |

Integração: a loja grava pedidos em `pedidos` e mexe no estoque via função `criar_pedido`. O painel lê vendas por RPCs `security definer` (só agregados ou metadados, nunca dado pessoal cru) e o recebimento de pedido de compra atualiza `produtos.estoque` por trigger.

---

## 4. Banco de dados

> **A pasta `supabase/migrations/` NÃO descreve este banco.** O `0001_init.sql`
> declara `produtos.estoque_atual`, uma tabela `movimentacoes_estoque` e a função
> `trg_recebimento_item()` — nada disso existe em produção. O banco foi
> reconstruído em 10/09/2026 num modelo diferente e as migrações nunca foram
> atualizadas. Para saber o que existe, leia o catálogo do Postgres, nunca os
> arquivos de migração.

### Tabela `produtos` (14 colunas)
`id bigint generated always as identity`, `cod text`, `nome text`, `preco numeric`, `tamanhos jsonb` (array de grades), `estoque jsonb` (objeto com chave por grade, ex.: `{"41-42": 5}`), `img text`, `imagens jsonb`, `descricao text`, `ativo boolean`, `custo_produto numeric`, `custo_frete numeric`, `custo_embalagem numeric`, `criado_em timestamptz`.

### Tabela `pedidos`
Contém **dado pessoal do cliente** — acesso restrito a `authenticated`. A coluna `itens` é um **array JSONB** com as chaves `cod`, `nome`, `tamanho`, `qtd`, `preco_unit`, `produto_id`. A chave `tamanho` é gravada pela loja (`index.html`, montagem do item no checkout) e usada pelo painel na tela de Vendas.

> Consulta de venda por produto **exige** desempacotar com `jsonb_array_elements` em lateral join. Não dá para juntar direto em `pedidos`.

### Tabelas gerenciais (todas RLS, só `authenticated`)
`fornecedores`, `pedidos_compra`, `pedido_compra_itens`, `recebimentos`, `recebimento_itens`, `contas_pagar`, `despesas`, `retiradas_socios`, `ativacoes`, `ativacao_itens`.

### Funções

| Função | Papel |
|---|---|
| `criar_pedido` | Cria/atualiza pedido da loja. `security definer`, `for update` com travamento de linha, resolve o produto por três caminhos (`cod` → `produto_id` → `nome`), faz upsert para não duplicar pendente. Exceções tipadas: `SEM_PRODUTO`, `INATIVO`, `SEM_ESTOQUE` |
| `fn_dashboard` | KPIs do painel. Campos incluem `compra_vendidos`, `compra_estoque`, `lucro_total` |
| `fn_reposicao` | Sugestão de reposição por grade, corrigida por período real de operação e supressão de demanda |
| `fn_top_produtos` | Ranking de produtos |
| `fn_vendas_por_dia` | Série diária de vendas |
| `fn_vendas_lista` | Lista de vendas |
| `fn_sugestao_retirada` | Sugestão de retirada do sócio x caixa a manter |

### Gatilhos (nomes conferidos em 28/10/2026)

A convenção confunde: **"recebimento" vira `receb`** e o **prefixo `trg_` fica na função**, não no gatilho.

| Tabela | Gatilho | Função |
|---|---|---|
| `recebimento_itens` | `receb_item` | `trg_receb_item` |
| `recebimento_itens` | `receb_conta_valor` | `trg_receb_conta_valor` |
| `recebimentos` | `receb_conta` | `trg_receb_conta` |
| `pedidos` | `pedido_estoque` | `trg_pedido_estoque` |
| `ativacao_itens` | `ativ_item` | `trg_ativ_item` |
| `fin_investimentos`, `fin_lancamentos`, `fin_mov_investimentos`, `fin_orcamentos` | `fin_*_valida` | `fin_valida_dono` |

Todos habilitados. Procurar por `%recebimento%` em `pg_trigger` ou `pg_proc` devolve zero linhas e leva à conclusão falsa de que o gatilho não existe.

### Onde o estoque realmente fica

O saldo é a coluna **`estoque` (jsonb) da tabela `produtos`**, mapa grade→quantidade. Não há tabela de estoque nem de movimentação. `v_estoque` é só leitura: soma as chaves do jsonb com `jsonb_each_text`. Consequência: **não existe histórico de movimentação** — nada para auditar nem para reconstruir o saldo.

### Permissões
- Todas as tabelas gerenciais: RLS liberando apenas `authenticated`.
- Funções gerenciais: `revoke execute ... from public, anon` + `grant execute ... to authenticated, service_role`.
- `produtos`: leitura pública **por coluna** — `anon` lê apenas `id, cod, nome, preco, tamanhos, estoque, img, imagens, descricao, ativo, criado_em`. As colunas de custo ficam fora.

---

## 5. Como aplicar mudanças

### Banco
- **DDL** (create/drop function, alterações de schema, grants): `apply_migration` do MCP do Supabase — transacional e versionado.
- **Consulta e conferência de dados**: `execute_sql`.
- Se o MCP do Supabase não estiver conectado na sessão, gere o SQL completo em bloco único para o Roberto colar no SQL Editor do Supabase, e diga exatamente onde clicar.

### Como chegar ao código e ao contexto

Não existe clone local dos repositórios. Os documentos de contexto (`CLAUDE.md`, `LICOES-APRENDIDAS.md`, `ESTADO-ATUAL-E-PENDENCIAS.md`, `PROMPT-INICIAL.md`) ficam soltos em `C:\Users\Roberto Cardoso F\Downloads` — leia direto de lá no início da sessão.

Para ler código, em ordem de facilidade:

1. **ZIP do repositório** — no GitHub, Code → Download ZIP. Funciona sem conector nenhum e vem exatamente o que está publicado. Caminho direto: `https://github.com/robertodmoraescardoso-ctrl/<repo>/archive/refs/heads/main.zip`
2. **Conector do GitHub** — precisa de autorização via `/mcp`. Já falhou com "não foi possível iniciar o login".

Conector do Supabase: a autorização já veio presa na organização errada. A org `vercel_icfg_...` ("Beblue", criada pela integração do Vercel) não enxerga o projeto `czocwpxhdztdoslmaajg` e devolve `You do not have permission to perform this action`. Confira a organização na tela de autorização do OAuth.

### Código
1. Você entrega o **arquivo inteiro** pronto.
2. Roberto abre o arquivo no GitHub pelo navegador, cola e faz commit.
3. `gestao-sandalias` → a Vercel faz deploy automático no push.
4. `beblue-loja` → o GitHub Pages publica sozinho em alguns minutos.

> Nunca assuma que um arquivo que você entregou já está publicado. **Já aconteceu de um arquivo ficar semanas sem subir e o bug reportado ser só isso.** Confirme lendo o arquivo no repositório antes de investigar qualquer coisa.

---

## 6. Regras invioláveis

1. **Nunca rode migração destrutiva sem antes inspecionar o schema existente.** Nada de `drop table ... cascade` sem leitura prévia. Já destruiu a tabela `produtos` em produção uma vez.
2. **Este banco é produção.** Não existe ambiente de teste. Toda alteração afeta a loja no ar.
3. **`pedidos` tem dado pessoal.** Nenhuma política permissiva, nenhum acesso `anon`, nenhuma RPC que devolva dado cru de cliente.
4. **Ao trocar o retorno de uma função**, `DROP FUNCTION IF EXISTS` antes do `CREATE FUNCTION`, na mesma migração. `CREATE OR REPLACE` sozinho falha quando as colunas de retorno mudam.
5. **Revogar de `anon` não basta** — se o grant a `PUBLIC` continuar, `anon` continua executando. Revogue de `public, anon` e confira com `has_function_privilege('anon', '<assinatura>', 'execute')`.
6. **RLS libera a tabela inteira, não coluna.** Para esconder custo, use grant por coluna.
7. Não proponha fluxo que dependa de terminal local.
8. **Se a operação for perder alguma informação, não exclua.** Regra dada em 28/10/2026. Vale para o que você executa e para o que você escreve no código dele: use status cancelado, inativo ou arquivado em vez de `delete`. Exclusão em duas etapas (filhos e depois pai) é proibida — quando a segunda falha, os filhos já se foram.
9. **Toda consulta na tela precisa tratar o `error`.** O padrão `.then(({ data }) => setRows(data || []))` transforma falha em "nenhum registro" e faz o painel mentir. Leia o `error`, mostre na tela, e separe "Carregando…" de "vazio".
