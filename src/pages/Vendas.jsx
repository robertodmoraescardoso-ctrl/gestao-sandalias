import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { brl, num } from '../lib/format'
import { Page, PageHeader, Card, Badge, Empty, Kpi, inputCls } from '../components/ui'

const statusInfo = {
  entregue: ['verde', 'Entregue'],
  confirmado: ['azul', 'Confirmado'],
  pago_declarado: ['azul', 'Pago declarado'],
  pendente: ['amarelo', 'Pendente'],
  cancelado: ['vermelho', 'Cancelado'],
}
const VALIDAS = ['entregue', 'confirmado', 'pago_declarado']

function dataHora(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Vendas() {
  const [rows, setRows] = useState([])
  const [filtro, setFiltro] = useState('validas')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('pedidos')
      .select('id, codigo, itens, total, cliente_nome, status, criado_em, modo_entrega, taxa_entrega')
      .order('criado_em', { ascending: false })
      .limit(300)
      .then(({ data }) => { setRows(data || []); setLoading(false) })
  }, [])

  const visiveis = rows.filter((r) =>
    filtro === 'todas' ? true
    : filtro === 'validas' ? VALIDAS.includes(r.status)
    : r.status === filtro)

  const itensResumo = (itens) =>
    (itens || []).map((i) => `${i.nome}${i.tamanho ? ` (${i.tamanho})` : ''} ×${i.qtd}`).join(', ')

  return (
    <Page>
      <PageHeader title="Vendas" subtitle="Pedidos vindos direto do seu site — atualizados automaticamente." />

      <Card title="Pedidos do site" right={
        <select className={inputCls + ' !py-1.5 !w-44'} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="validas">Vendas válidas</option>
          <option value="todas">Todos</option>
          <option value="entregue">Entregues</option>
          <option value="confirmado">Confirmados</option>
          <option value="pendente">Pendentes</option>
          <option value="cancelado">Cancelados</option>
        </select>
      }>
        {loading ? <Empty>Carregando…</Empty> : visiveis.length === 0 ? (
          <Empty>Nenhum pedido nesse filtro.</Empty>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink/45 text-xs border-b border-borda">
                <th className="py-2 pr-3">Data</th><th className="py-2 px-3">Código</th>
                <th className="py-2 px-3">Cliente</th><th className="py-2 px-3">Itens</th>
                <th className="py-2 px-3 text-right">Total</th><th className="py-2 pl-3">Status</th>
              </tr></thead>
              <tbody>{visiveis.map((r) => {
                const [tone, label] = statusInfo[r.status] || ['neutro', r.status]
                return (
                  <tr key={r.id} className="border-b border-borda/50">
                    <td className="py-2 pr-3 text-ink/60 whitespace-nowrap">{dataHora(r.criado_em)}</td>
                    <td className="py-2 px-3 font-medium">{r.codigo || '—'}</td>
                    <td className="py-2 px-3">{r.cliente_nome || '—'}</td>
                    <td className="py-2 px-3 text-ink/60 max-w-[320px]">{itensResumo(r.itens)}</td>
                    <td className="py-2 px-3 text-right tnum">{brl(r.total)}</td>
                    <td className="py-2 pl-3"><Badge tone={tone}>{label}</Badge></td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  )
}
