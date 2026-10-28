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

---

## Processo e diagnóstico

**9. Antes de investigar bug, confirme que o arquivo foi publicado.**
Em 05/10/2026 um cartão "não aparecia no painel" — a causa era que o `Dashboard.jsx` entregue nunca tinha subido ao GitHub. Leia o arquivo no repositório antes de abrir qualquer hipótese técnica.

**10. Ao montar uma versão nova de um arquivo, parta da versão que está no GitHub.**
Não parta da última versão que você gerou. Pode haver entrega anterior não publicada ou edição feita pelo Roberto.

**11. Cache da API do Supabase atrapalha função nova.**
Criar uma RPC nova e chamá-la logo em seguida já devolveu 404 por cache. Saída que funcionou: **alterar a função existente para receber um parâmetro a mais**, em vez de criar função nova.

---

## Regra de negócio dentro do código

**12. Zero venda não é zero demanda.**
O cálculo de velocidade de venda precisa descontar os dias em que a grade esteve zerada. A velocidade diária é calculada só sobre os dias em que o item esteve efetivamente disponível, e o período de operação é o período real (primeira venda em 28/08/2026), não 30 dias fixos. Essa é a razão de existir a coluna "Base" na tabela de reposição.

**13. QR Code Pix precisa ser BR Code tipo 11.**
Gerado como tipo 12, o banco Inter recusa. Identificador `***`, chave `+5581973425000`. Checksum CRC16 no final.

**14. Detalhes de front que já quebraram:**
`object-fit` nas fotos distorcia no iPhone; o botão de fechar do modal de produto ficava escondido atrás do cabeçalho fixo no mobile; o formulário de produto reaproveitava quantidades do produto editado anteriormente.
