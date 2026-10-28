# Lições aprendidas — Beblue

Cada item abaixo veio de um problema real neste projeto. São regras, não sugestões.

---

## Banco de dados

**1. Inspecione o schema antes de qualquer migração destrutiva.**
No início do projeto um script de reset com `drop table ... cascade` foi rodado sem ler o schema existente e destruiu a tabela `produtos` em produção. A loja saiu do ar e o Roberto teve que reconstruir a tabela a partir dos SQLs dele. Este banco é produção e não tem ambiente de teste.

**2. Trocar o retorno de uma função exige DROP antes do CREATE.**
Quando a função muda o tipo de retorno ou a lista de colunas, `CREATE OR REPLACE` sozinho falha ou erra silenciosamente. Coloque `DROP FUNCTION IF EXISTS` antes do `CREATE FUNCTION`, na mesma migração.

**3. Revogar de `anon` não adianta se o grant a `PUBLIC` continuar.**
`PUBLIC` inclui `anon`. Em 14/09/2026 `fn_dashboard`, `fn_reposicao`, `fn_top_produtos`, `fn_vendas_lista` e `fn_vendas_por_dia` estavam executáveis por visitante anônimo exatamente por isso. Correção: `revoke execute ... from public, anon` seguido de `grant execute ... to authenticated, service_role`. Sempre conferir depois:

```sql
select has_function_privilege('anon', 'fn_dashboard(date,date)', 'execute');
```

**4. RLS libera a tabela inteira, não coluna.**
A política de leitura pública de `produtos` expunha também `custo_produto`. Corrigido com grant por coluna: `anon` lê apenas `id, cod, nome, preco, tamanhos, estoque, img, imagens, descricao, ativo, criado_em`. A loja já pedia só essas colunas, então nada quebrou.

**5. Política permissiva em tabela com dado pessoal é incidente de segurança.**
Uma política `p_all` foi aplicada por engano em `pedidos`. Foi removida e substituída por acesso só a `authenticated`. As RPCs do dashboard viraram `security definer` justamente para calcular agregados sobre tabelas protegidas sem expor dado cru.

**6. ID de produto não é referência confiável no histórico.**
A tabela `produtos` foi recriada em 10/09/2026, gerando IDs novos (1-4) enquanto pedidos antigos ainda apontavam para os IDs velhos (10-13). `criar_pedido` foi reescrita para resolver o produto por três caminhos em cascata (`cod` → `produto_id` → `nome`) e reescrever os três campos a partir do catálogo atual antes de salvar. Mantenha esse comportamento em qualquer alteração futura.

**7. Consulta de venda por produto exige desempacotar o JSONB.**
`pedidos.itens` é array JSONB (`cod`, `nome`, `qtd`, `preco_unit`, `produto_id`). Use `jsonb_array_elements` em lateral join; não existe join direto.

**8. Função sumida geralmente é projeto errado, não permissão.**
Já houve diagnóstico perdido olhando o projeto `mouphzazqsikbeibgqyh` em vez de `czocwpxhdztdoslmaajg`. Diagnóstico: comparar o project ID da URL do navegador com o `apiUrl` do código do front. Para listar:

```sql
select n.nspname, p.proname from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname ilike '%pedido%';
```

Zero linhas significa projeto errado ou função nunca criada — não é erro de permissão. Para ler o corpo, `pg_get_functiondef(oid)` funciona melhor que `prosrc`.

**9. As migrações do repositório NÃO descrevem o banco atual.**
Descoberto em 28/10/2026. O `0001_init.sql` declara um schema que não existe mais:

| | Migração 0001 | Produção |
|---|---|---|
| Saldo | `produtos.estoque_atual int` | `produtos.estoque` jsonb por grade |
| Histórico | tabela `movimentacoes_estoque` | **não existe** |
| Custo médio | `produtos.custo_medio` | soma dos três custos, dentro da view |
| Função do recebimento | `trg_recebimento_item()` | `trg_receb_item()` |
| Gatilho | `recebimento_item` | `receb_item` |
| `estoque_minimo` | coluna da tabela | fixo em 5 dentro da view |

O banco foi reconstruído em 10/09/2026 num modelo diferente e as migrações nunca
foram atualizadas. **Nunca tome o `supabase/migrations/` como descrição do banco.**
Leia o catálogo do Postgres.

**10. Busca por nome em catálogo dá falso negativo.**
Em 28/10/2026 uma sessão inteira se perdeu procurando `trg_recebimento_item`, que
não existe com esse nome. Duas armadilhas:

- Gatilhos e funções **abreviam** "recebimento" para `receb`, e o prefixo `trg_`
  fica na **função**, não no gatilho: o gatilho é `receb_item`, a função é
  `trg_receb_item`. As tabelas usam o nome completo (`recebimento_itens`).
- O estoque não está em tabela com "estoque" no nome: é a **coluna** `estoque` da
  tabela `produtos`. Procurar tabela `%estoque%` só acha a view `v_estoque`.

Para diagnóstico de schema, **liste tudo sem filtro de nome e leia a lista**:

```sql
select c.relname as tabela, t.tgname as gatilho, p.proname as funcao, t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public' and not t.tgisinternal
order by 1, 2;
```

Gatilhos existentes em 28/10/2026: `receb_item`, `receb_conta_valor` (em
`recebimento_itens`), `receb_conta` (em `recebimentos`), `pedido_estoque` (em
`pedidos`), `ativ_item` (em `ativacao_itens`) e `fin_*_valida` em quatro tabelas
financeiras.

**11. O SQL Editor só mostra o resultado do último comando.**
Colar vários blocos e clicar em Run executa todos, mas exibe só a saída do último.
Rode um bloco por vez: selecione o texto e use Ctrl+Enter.

**12. Não existe histórico de movimentação de estoque.**
Produção guarda só o retrato atual em `produtos.estoque`. Não há como auditar de
onde veio cada par, nem reconstruir o saldo se ele for corrompido, e duas escritas
simultâneas no jsonb podem se sobrescrever. A contagem física de 03/10/2026
corrigiu o saldo sem deixar rastro do que foi corrigido.

---

## Processo e diagnóstico

**13. Antes de investigar bug, confirme que o arquivo foi publicado.**
Em 05/10/2026 um cartão "não aparecia no painel" — a causa era que o `Dashboard.jsx` entregue nunca tinha subido ao GitHub. Leia o arquivo no repositório antes de abrir qualquer hipótese técnica.

**14. Ao montar uma versão nova de um arquivo, parta da versão que está no GitHub.**
Não parta da última versão que você gerou. Pode haver entrega anterior não publicada ou edição feita pelo Roberto.

**15. Cache da API do Supabase atrapalha função nova.**
Criar uma RPC nova e chamá-la logo em seguida já devolveu 404 por cache. Saída que funcionou: **alterar a função existente para receber um parâmetro a mais**, em vez de criar função nova.

**16. Consulta que falha vira "nenhum registro" na tela.**
Descoberto em 28/10/2026. O padrão `.then(({ data }) => setRows(data || []))`
descarta o `error`. View ausente, permissão negada ou sessão expirada resultam em
`data` nulo, o `|| []` vira lista vazia e a tela exibe "Nenhuma conta registrada" —
idêntico a não ter nenhuma. Numa tela de decisão isso é pior que um erro visível.
Afetava Contas a pagar, Retiradas, Despesas e Ativações; o `Vendas.jsx` já tratava
certo. **Sempre leia o `error` e mostre na tela**, e separe o estado "Carregando…"
do estado "vazio".

**17. Exclusão em duas etapas perde os filhos quando a segunda falha.**
O `ExcluirPedido` apagava `pedido_compra_itens` e depois `pedidos_compra` em duas
chamadas separadas. Se a segunda falhasse, os itens já tinham sido destruídos sem
volta. Virou cancelamento por status em 28/10/2026. **Regra do Roberto: se a
operação for perder alguma informação, não exclua** — use status cancelado,
inativo ou arquivado.

**18. Onde está o contexto e como chegar ao código.**
Não existe clone local dos repositórios. Os documentos de contexto ficam soltos em
`C:\Users\Roberto Cardoso F\Downloads`. Para ler código sem o conector do GitHub,
peça o ZIP: no repositório, Code → Download ZIP. O conector do Supabase já veio
autorizado na organização errada — a org `vercel_icfg_...` ("Beblue", criada pela
integração do Vercel) não enxerga o projeto `czocwpxhdztdoslmaajg` e devolve
`You do not have permission to perform this action`. Confira a organização na tela
de autorização.

---

## Regra de negócio dentro do código

**19. Zero venda não é zero demanda.**
O cálculo de velocidade de venda precisa descontar os dias em que a grade esteve zerada. A velocidade diária é calculada só sobre os dias em que o item esteve efetivamente disponível, e o período de operação é o período real (primeira venda em 28/08/2026), não 30 dias fixos. Essa é a razão de existir a coluna "Base" na tabela de reposição.

**20. QR Code Pix precisa ser BR Code tipo 11.**
Gerado como tipo 12, o banco Inter recusa. Identificador `***`, chave `+5581973425000`. Checksum CRC16 no final.

**21. Detalhes de front que já quebraram:**
`object-fit` nas fotos distorcia no iPhone; o botão de fechar do modal de produto ficava escondido atrás do cabeçalho fixo no mobile; o formulário de produto reaproveitava quantidades do produto editado anteriormente.
