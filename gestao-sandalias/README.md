# Gestão Sandálias

Painel de gestão para revenda de sandálias, integrando **Compras → Estoque → Vendas → Financeiro** num único fluxo. Frontend em React (Vite) e banco no Supabase (Postgres), com toda a lógica de integração implementada como triggers no banco.

## O que já vem pronto

- **Painel do gestor**: faturamento, lucro bruto (Faturamento − CMV), lucro geral, contas vencidas, estoque, trânsito, top produtos e evolução das vendas, com filtro por período.
- **Compras**: pedidos ao fornecedor com itens, status (realizado → confirmado → em trânsito → parcial → recebido) e **recebimento parcial ou total**.
- **Estoque**: disponível, em trânsito, custo médio, valor em custo/potencial, giro, filtros de estoque baixo e parados.
- **Vendas**: cada venda **baixa o estoque** e grava o **custo (CMV)** do momento automaticamente.
- **Financeiro**: contas a pagar (criadas sozinhas no recebimento, com vencimento = recebimento + prazo do fornecedor), retiradas dos sócios (isoladas do resultado) e despesas.
- **Ativações/Marketing**: doação de sandálias (sai do estoque como marketing, não como venda) e pagamento a influenciadores, com cupom para medir retorno.

### Automações no banco (você nunca lança duas vezes)

| Ação | O que dispara automaticamente |
|---|---|
| Receber um pedido | entra no estoque + recalcula custo médio + cria a conta a pagar |
| Registrar uma venda | baixa o estoque + grava o CMV daquele item |
| Doar em uma ativação | baixa o estoque como "saída por doação" (não vira faturamento) |

---

## Passo a passo

### 1. Criar o projeto no Supabase
1. Acesse [supabase.com](https://supabase.com) e crie um projeto (guarde a senha do banco).
2. No projeto, vá em **SQL Editor** → **New query**.
3. Cole todo o conteúdo de `supabase/migrations/0001_init.sql` e clique em **Run**.
4. (Opcional) rode `supabase/seed.sql` da mesma forma para ter dados de exemplo.
5. Vá em **Project Settings → API** e copie **Project URL** e a chave **anon public**.

### 2. Configurar e rodar o frontend
```bash
npm install
cp .env.example .env
# edite o .env com a URL e a anon key do passo anterior
npm run dev
```
Abra o endereço que o Vite mostrar (normalmente `http://localhost:5173`).

Primeiro uso: cadastre **fornecedores** e **produtos** (aba Cadastros), depois lance um **pedido de compra**, faça o **recebimento** e você verá o estoque e a conta a pagar aparecerem sozinhos.

### 3. Subir no GitHub
```bash
git init
git add .
git commit -m "Sistema de gestão de sandálias"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/gestao-sandalias.git
git push -u origin main
```
O `.gitignore` já evita subir `node_modules` e o `.env` (suas chaves ficam fora do repositório).

### 4. (Opcional) Publicar online
Importe o repositório na **Vercel** ou **Netlify**, defina as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel do serviço e faça o deploy. Comando de build: `npm run build`, pasta de saída: `dist`.

---

## Segurança

A migração habilita RLS com uma política permissiva (`using (true)`) para funcionar como ferramenta de usuário único com a chave anon. **Antes de expor publicamente**, adicione autenticação (Supabase Auth) e restrinja as políticas ao seu usuário. A `anon key` pode ir para o frontend; a `service_role key` **nunca**.

## Estrutura
```
supabase/migrations/0001_init.sql  → schema, triggers, views e funções
supabase/seed.sql                  → dados de exemplo (opcional)
src/pages/                         → Painel, Compras, Estoque, Vendas, Financeiro, Ativações, Cadastros
src/components/                    → UI reutilizável
src/lib/                           → cliente Supabase e formatação
```

## Próximos passos sugeridos (não implementados ainda)
- Estoque reservado (venda com entrega futura)
- Retorno por cupom nas ativações (ROI por influenciador)
- Curva ABC e comparação automática entre períodos
- Autenticação e políticas RLS por usuário
