import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { brl, num, periodo, dataBR } from '../lib/format'
import { Page, PageHeader, Kpi, Card, Empty } from '../components/ui'

const periodos = [
  { chave: '7d', label: '7 dias' },
  { chave: '30d', label: '30 dias' },
  { chave: 'mes', label: 'Mês atual' },
  { chave: 'ano', label: 'Ano' },
]

export default function Dashboard() {
  const [chave, setChave] = useState('30d')
  const [kpi, setKpi] = useState(null)
  const [top, setTop] = useState([])
  const [serie, setSerie] = useState([])
  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { inicio, fim } = periodo(chave)
    setLoading(true)
    setErro(null)
    Promise.all([
      supabase.rpc('fn_dashboard', { p_inicio: inicio, p_fim: fim }),
      supabase.rpc('fn_top_produtos', { p_inicio: inicio, p_fim: fim, p_limite: 5 }),
      supabase.rpc('fn_vendas_por_dia', { p_inicio: inicio, p_fim: fim }),
    ])
      .then(([d, t, s]) => {
        if (d.error) throw d.error
        setKpi(d.data)
        setTop((t.data || []).map((r) => ({ nome: r.produto, qtd: Number(r.quantidade), fat: Number(r.faturamento) })))
        setSerie((s.data || []).map((r) => ({ dia: dataBR(r.dia).slice(0, 5), fat: Number(r.faturamento) })))
      })
      .catch((e) => setErro(e.message || String(e)))
      .finally(() => setLoading(false))
  }, [chave])

  return (
    <Page>
      <PageHeader
        title="Painel do gestor"
        subtitle="O que comprei, o que recebi, o que vendi, quanto ganhei e quanto tenho a pagar."
        right={
          <div className="flex gap-1 bg-white border border-borda rounded-md p-1">
            {periodos.map((p) => (
              <button
                key={p.chave}
                onClick={() => setChave(p.chave)}
                className={`text-xs px-2.5 py-1.5 rounded ${
                  chave === p.chave ? 'bg-ink text-white' : 'text-ink/60 hover:bg-ink/5'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {erro && (
        <div className="bg-alerta/10 text-alerta text-sm rounded-md p-3 mb-6">
          Não foi possível carregar os dados: {erro}. Rode a migração no Supabase e confira o .env.
        </div>
      )}
      {loading && !kpi && <Empty>Carregando…</Empty>}

      {kpi && (
        <div className="space-y-6">
          {/* Financeiro */}
          <section>
            <h2 className="font-display font-semibold text-ink/70 text-sm mb-2">Financeiro</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Faturamento" value={brl(kpi.faturamento)} big />
              <Kpi label="Lucro bruto (vendas)" value={brl(kpi.lucro_bruto)} hint="Faturamento − CMV"
                tone={kpi.lucro_bruto >= 0 ? 'positivo' : 'negativo'} big />
              <Kpi label="Lucro geral do período" value={brl(kpi.lucro_geral)}
                hint="− despesas − ativações" tone={kpi.lucro_geral >= 0 ? 'positivo' : 'negativo'} big />
              <Kpi label="Contas vencidas" value={brl(kpi.total_vencido)}
                tone={kpi.total_vencido > 0 ? 'negativo' : 'default'} big />
              <Kpi label="CMV (custo do vendido)" value={brl(kpi.cmv)} />
              <Kpi label="Total a pagar" value={brl(kpi.total_a_pagar)} hint={`${brl(kpi.vence_7)} vencem em 7 dias`} />
              <Kpi label="Ativações / marketing" value={brl(kpi.ativacoes)} />
              <Kpi label="Retiradas dos sócios" value={brl(kpi.retiradas)} hint="fora do resultado" />
            </div>
          </section>

          <div className="grid md:grid-cols-3 gap-6">
            <Card title="Evolução das vendas" className="md:col-span-2">
              {serie.length === 0 ? (
                <Empty>Sem vendas no período.</Empty>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={serie} margin={{ left: 4, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={70}
                      tickFormatter={(v) => 'R$' + (v / 1000).toFixed(0) + 'k'} />
                    <Tooltip formatter={(v) => brl(v)} />
                    <Line type="monotone" dataKey="fat" stroke="#0E8060" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Indicadores de venda">
              <div className="space-y-3 text-sm">
                <Linha rot="Peças vendidas" val={num(kpi.qtd_vendida)} />
                <Linha rot="Nº de vendas" val={num(kpi.num_vendas)} />
                <Linha rot="Ticket médio" val={brl(kpi.ticket_medio)} />
                <Linha rot="Margem bruta" val={
                  kpi.faturamento > 0
                    ? ((kpi.lucro_bruto / kpi.faturamento) * 100).toFixed(1) + '%'
                    : '—'
                } />
              </div>
            </Card>
          </div>

          {/* Estoque + Compras */}
          <div className="grid md:grid-cols-3 gap-6">
            <Card title="Estoque">
              <div className="space-y-3 text-sm">
                <Linha rot="Valor em estoque (custo)" val={brl(kpi.estoque_custo)} />
                <Linha rot="Valor potencial de venda" val={brl(kpi.estoque_potencial)} />
                <Linha rot="Mercadoria em trânsito" val={brl(kpi.mercadoria_transito)} />
              </div>
            </Card>

            <Card title="Compras / a pagar">
              <div className="space-y-3 text-sm">
                <Linha rot="Vence em 7 dias" val={brl(kpi.vence_7)} />
                <Linha rot="Vence em 30 dias" val={brl(kpi.vence_30)} />
                <Linha rot="Já pago no período" val={brl(kpi.total_pago)} />
              </div>
            </Card>

            <Card title="Top 5 produtos">
              {top.length === 0 ? (
                <Empty>Sem vendas no período.</Empty>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={top} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="nome" width={90} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v, n) => (n === 'fat' ? brl(v) : v)} />
                    <Bar dataKey="fat" fill="#E7B24C" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </div>
      )}
    </Page>
  )
}

function Linha({ rot, val }) {
  return (
    <div className="flex justify-between border-b border-borda/60 pb-2 last:border-0">
      <span className="text-ink/60">{rot}</span>
      <span className="font-display font-semibold tnum">{val}</span>
    </div>
  )
}
