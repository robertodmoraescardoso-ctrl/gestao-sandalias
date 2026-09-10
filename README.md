# Gestão Sandálias

Painel de gestão para revenda de sandálias, integrando **Compras → Estoque → Vendas → Financeiro** num único fluxo. Toda a lógica de integração fica no banco (Supabase), então você nunca lança a mesma coisa duas vezes.

> **Você não precisa instalar Node.js nem usar terminal.** O passo a passo abaixo publica o painel online usando só o navegador. A parte técnica (build) roda na nuvem.

---

## Passo a passo (sem terminal)

### 1. Banco de dados (Supabase) — provavelmente você já fez
Se ainda não fez: no seu projeto Supabase, abra **SQL Editor**, cole o conteúdo de `supabase/migrations/0001_init.sql` e clique em **Run**. Depois copie, em **Project Settings -> API**, a **Project URL** e a chave **anon public** (vamos usar no passo 3).

### 2. Subir o projeto no GitHub (arrastando arquivos)
1. Crie uma conta em github.com se não tiver.
2. Clique em **New repository**, dê um nome (ex.: gestao-sandalias) e clique em **Create repository**.
3. Na página do repositório vazio, clique em **Add file -> Upload files**.
4. **Descompacte** o gestao-sandalias.zip no seu computador, abra a pasta e **arraste todos os arquivos e pastas de dentro dela** para a área de upload do GitHub.
5. Clique em **Commit changes**. Pronto, o código está no GitHub.

> Importante: arraste o **conteúdo** da pasta (os arquivos package.json, index.html, a pasta src, etc.), nao a pasta gestao-sandalias inteira.

### 3. Publicar online (Vercel) — gera o link do painel
1. Acesse vercel.com e entre com a sua conta do **GitHub**.
2. Clique em **Add New -> Project** e escolha o repositório gestao-sandalias.
3. A Vercel detecta que e um projeto Vite automaticamente. **Antes de clicar em Deploy**, abra **Environment Variables** e adicione as duas:

   | Name | Value |
   |---|---|
   | VITE_SUPABASE_URL | sua Project URL do Supabase |
   | VITE_SUPABASE_ANON_KEY | sua chave anon public |

4. Clique em **Deploy**. Em cerca de 1 minuto a Vercel te da um link (ex.: gestao-sandalias.vercel.app). Esse e o seu painel, acessivel de qualquer lugar, inclusive do celular.

Sempre que quiser mudar algo, e so editar/subir os arquivos no GitHub que a Vercel republica sozinha.

### 4. Primeiro uso (a ordem importa)
No painel: **Cadastros** (fornecedor + produtos) -> **Compras** (criar pedido e clicar em Receber) -> **Vendas** (registrar venda) -> **Painel** mostra os numeros. Ao receber um pedido o estoque e a conta a pagar aparecem sozinhos; ao vender, o estoque baixa e o custo e gravado.

---

## Seguranca (leia antes de usar pra valer)
O banco vem com uma politica permissiva para funcionar como ferramenta de um usuario so. Quem tiver o link e a chave anon consegue ler/gravar. Para uso pessoal e privado esta ok; se for expor a mais pessoas, adicione **login (Supabase Auth)** e restrinja o acesso. A chave **anon** pode ficar no site; a chave **service_role** nunca.

## Estrutura
```
supabase/migrations/0001_init.sql  -> schema, triggers, views e funcoes do banco
supabase/seed.sql                  -> dados de exemplo (opcional)
src/pages/                         -> Painel, Compras, Estoque, Vendas, Financeiro, Ativacoes, Cadastros
```

## Proximos passos possiveis (nao incluidos ainda)
Estoque reservado, retorno por cupom nas ativacoes (ROI por influenciador), curva ABC, comparacao entre periodos e login por usuario.
