# Estado atual e pendências — Beblue

Última consolidação: 05/11/2026. Registro histórico, **não é verdade
garantida**: confirme no banco e no repositório antes de agir.

> Este repositório é público. Custos por modelo, margens, estado financeiro
> e regras de retirada de sócio **não ficam aqui** — chegam por anexo no
> início da sessão. O que segue é só o estado técnico.

---

## 1. O que está pronto e rodando

- Loja `beblue.shop`: catálogo, carrinho, frete por distância, checkout com
  QR Code Pix e botão "Já paguei".
- Painel `gestao-sandalias.vercel.app`: dashboard, compras, estoque,
  financeiro, ativações e vendas, com login Supabase Auth.
- **Compras → Excluir** (commit `d2b2aae`, 28/10/2026). Só aparece em pedido
  com zero peças recebidas. Nesse caso não houve recebimento, então não há
  estoque para devolver nem conta a pagar para apagar.
- **Compras → Status manual travado** (mesmo commit). "Recebido" e
  "Parcialmente recebido" saíram da caixa de edição: quem define esses dois
  é o gatilho do recebimento. Antes dava para digitar "Recebido" à mão e
  parecer que a mercadoria tinha entrado sem nada ter entrado.
- **Vendas → Trocar tamanho** (commit `5c15781`, 05/11/2026). Migração
  `0006_troca_tamanho.sql` aplicada no banco em 05/11. Devolve o par da
  grade antiga, tira da nova e reescreve o item do pedido, em uma operação
  só, com `for update` no produto. Recusa a troca quando a grade nova não
  tem saldo.

---

## 2. Pendências abertas

| # | Pendência | Sistema | Prioridade |
|---|---|---|---|
| 1 | `trg_pedido_estoque` só confere `SEM_ESTOQUE` e `INATIVO` quando `tg_op = 'INSERT'`. Pedido que sai de `cancelado` para status válido baixa estoque sem conferir saldo e pode deixar a grade negativa | banco | Média |
| 2 | Comentários da loja em `beblue-loja/index.html` dizem que o pedido pendente "não mexe no estoque". Está errado desde que a baixa foi para o gatilho: o estoque sai no `pendente` | beblue-loja | Média |
| 3 | Conector do Supabase não enxerga o projeto (lição 25). Enquanto não for resolvido, todo SQL vai para o Roberto colar à mão | ferramenta | Média |
| 4 | `criar_pedido` e os gatilhos `trg_pedido_estoque`, `trg_receb_item`, `trg_receb_conta`, `trg_receb_conta_valor` existem só dentro do banco, sem migração versionada. Se o banco cair, não há backup do código | banco | Média |
| 5 | Certificado HTTPS do GitHub Pages travado na loja (DNS verificado, certificado nunca emitido) | beblue-loja | Alta |
| 6 | Lançar no painel o histórico de despesas, ativações e retiradas desde 25/08. Enquanto não for feito, o cartão de lucro mostra margem bruta, não lucro líquido | gestao-sandalias | Alta |
| 7 | Tela de catálogo de produtos (`src/pages/Produtos.jsx` + rota no `App.jsx`) entregue em 14/09/2026 e nunca publicada. Confirmado ausente do repositório em 28/10 | gestao-sandalias | Média |
| 8 | Notificação por WhatsApp quando o cliente chega na tela do Pix | beblue-loja | Média |
| 9 | Cartão de crédito e envio pelos Correios, agora que o MEI está aberto. InfinitePay em avaliação | beblue-loja | Média |
| 10 | Refazer upload das fotos de produto, agora que o painel quadra a imagem no upload | gestao-sandalias | Média |
| 11 | Arquivar / despublicar o repositório `beblue-painel` (painel antigo, fora de uso) | beblue-painel | Baixa |
| 12 | Vendas manuais lançadas todas sob o mesmo telefone, mascarando o cadastro real de clientes | dados | Baixa |

---

## 3. Dúvidas já resolvidas — não reabrir

**A baixa de estoque acontece no `pendente`.** Havia contradição registrada
no histórico. Resolvida em 05/11/2026 lendo `trg_pedido_estoque`: o estoque
sai quando o pedido entra, volta quando é cancelado. A regra que o Roberto
definiu em out/2026 já está implementada. Os comentários da loja que dizem
o contrário é que estão velhos (pendência 2).

**O recebimento de compra alimenta o estoque.** Suspeita levantada em
28/10 e descartada em 05/11: o gatilho existe, chama-se `trg_receb_item`,
atualiza `produtos.estoque` na grade certa e recalcula o `custo_produto`
por média ponderada. Ver lição 22.

**Editar pedido de compra não mexe em estoque, e está certo assim.** Não
existe gatilho em `pedidos_compra` nem em `pedido_compra_itens`. Quem move
estoque é o recebimento. Mudar a quantidade pedida não deve mover estoque:
`quantidade` é o que se pediu, `quantidade_recebida` é o que chegou, e o
estoque espelha o segundo.

---

## 4. As migrações 0001 a 0004 estão obsoletas

Descrevem uma tabela `produtos` com `id uuid`, `estoque_atual int` e
`custo_medio`, que não existe desde a recriação de 10/09/2026. Ficam como
registro histórico. A `0006` é a primeira escrita contra o schema real.

A `0005` nunca existiu: ficou reservada a uma migração de editar/excluir
compra que acabou não sendo necessária — aquela funcionalidade saiu por
acesso direto às tabelas.

**Não deduza o estado do banco lendo este repositório. Leia o banco.**
