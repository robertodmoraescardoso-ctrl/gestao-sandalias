import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { brl, num, dataBR } from '../lib/format'
import { Page, PageHeader, Card, Badge, Empty, Kpi, inputCls } from '../components/ui'

export default function Estoque() {
  const [rows, setRows] = useState([])
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('v_estoque').select('*').order('nome').then(({ data }) => {
      setRows(data || [])
      setLoading(false)
    })
  }, [])

  const parado = (r) => !r.ultima_venda ||
    (new Date() - new Date(r.ultima_venda)) / 86400000 > 30
  const baixo = (r) => r.disponivel <= r.estoque_minimo

  const visiveis = rows.filter((r) => {
    if (busca && !r.nome.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtro === 'baixo') return baixo(r)
    if (filtro === 'parado') return parado(r)
    if (filtro === 'transito') return r.em_transito > 0
    return true
  })

  const totCusto = rows.reduce((s, r) => s + Number(r.valor_custo || 0), 0)
  const totPot = rows.reduce((s, r) => s + Number(r.valor_potencial || 0), 0)

  return (
    <Page>
      <PageHeader title="Estoque" subtitle="Estoque físico, em trânsito, custo e giro por produto." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Valor em estoque (custo)" value={brl(totCusto)} />
        <Kpi label="Valor potencial de venda" value={brl(totPot)} />
        <Kpi label="Margem potencial" value={totCusto > 0 ? (((totPot - totCusto) / totPot) * 100 || 0).toFixed(1) + '%' : '—'} />
        <Kpi label="Produtos com estoque baixo" value={num(rows.filter(baixo).length)}
          tone={rows.filter(baixo).length ? 'negativo' : 'default'} />
      </div>

      <Card
        title="Produtos"
        right={
          <div className="flex gap-2 items-center">
            <input className={inputCls + ' !py-1.5 !w-44'} placeholder="Buscar…"
              value={busca} onChange={(e) => setBusca(e.target.value)} />
            <select className={inputCls + ' !py-1.5 !w-40'} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="baixo">Estoque baixo</option>
              <option value="parado">Parados (30d+)</option>
              <option value="transito">Em trânsito</option>
            </select>
          </div>
        }
      >
        {loading ? <Empty>Carregando…</Empty> : visiveis.length === 0 ? (
          <Empty>Nenhum produto encontrado.</Empty>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink/45 text-xs border-b border-borda">
                  <th className="py-2 pr-3">Produto</th>
                  <th className="py-2 px-3 text-right">Disponível</th>
                  <th className="py-2 px-3 text-right">Trânsito</th>
                  <th className="py-2 px-3 text-right">Custo méd.</th>
                  <th className="py-2 px-3 text-right">Valor (custo)</th>
                  <th className="py-2 px-3 text-right">Vendido</th>
                  <th className="py-2 px-3">Últ. venda</th>
                  <th className="py-2 pl-3">Situação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((r) => (
                  <tr key={r.id} className="border-b border-borda/50">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.nome}</div>
                      {r.categoria && <div className="text-[11px] text-ink/45">{r.categoria}</div>}
                    </td>
                    <td className="py-2 px-3 text-right tnum">{num(r.disponivel)}</td>
                    <td className="py-2 px-3 text-right tnum text-ink/60">{num(r.em_transito)}</td>
                    <td className="py-2 px-3 text-right tnum">{brl(r.custo_medio)}</td>
                    <td className="py-2 px-3 text-right tnum">{brl(r.valor_custo)}</td>
                    <td className="py-2 px-3 text-right tnum">{num(r.total_vendido)}</td>
                    <td className="py-2 px-3 text-ink/60">{dataBR(r.ultima_venda)}</td>
                    <td className="py-2 pl-3 space-x-1">
                      {baixo(r) && <Badge tone="vermelho">baixo</Badge>}
                      {parado(r) && <Badge tone="amarelo">parado</Badge>}
                      {r.em_transito > 0 && <Badge tone="azul">a caminho</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  )
}
