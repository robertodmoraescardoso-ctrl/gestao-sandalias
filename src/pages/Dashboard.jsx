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

const COBERTURAS = [30, 45, 60, 90]

const PRIO = {
  CRITICO:  { txt: 'Acabou', cls: 'bg-red-100 text-red-700' },
  URGENTE:  { txt: 'Urgente', cls: 'bg-orange-100 text-orange-700' },
  ATENCAO:  { txt: 'Atenção', cls: 'bg-amber-100 text-amber-700' },
  SEM_GIRO: { txt: 'Sem giro', cls: 'bg-ink/10 text-ink/50' },
  OK:       { txt: 'Ok', cls: 'bg-emerald-100 text-emerald-700' },
}

export default function Dashboard() {
  const [chave, setChave] = useState('30d')
  const [kpi, setKpi] = useState(null)
  const [top, setTop] = useState([])
  const [serie, setSerie] = useState([])
  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(true)

  const [cobertura, setCobertura] = useState(30)
  const [repo, setRepo] = useState([])
  const [verTudo, setVerTudo] = useState(false)

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

  // sugestão de reposição — sempre analisa os últimos 30 dias de venda
  useEffect(() => {
    supabase
      .rpc('fn_reposicao', { p_dias: 30, p_cobertura: cobertura })
      .then(({ data, error }) => {
        if (error) { console.error(error); return }
        setRepo(data || [])
      })
  }, [cobertura])

  const aPedir = repo.filter((r) => Number(r.sugestao) > 0)
  const listaRepo = verTudo ? repo : aPedir
  const totalPares = aPedir.reduce((s, r) => s + Number(r.sugestao), 0)
  const totalCusto = aPedir.reduce((s, r) => s + Number(r.custo_sugestao), 0)
  const zerados = repo.filter((r) => r.prioridade === 'CRITICO').length

  // valores novos — protegidos caso a função do banco ainda não tenha sido atualizada
  const compraVendidos = Number(kpi?.compra_vendidos ?? 0)
  const compraEstoque = Number(kpi?.compra_estoque ?? 0)
  const lucroTotal = Number(kpi?.lucro_total ?? 0)

  function copiarPedido() {
    const linhas = aPedir.map(
      (r) => `${r.produto} | ${r.tamanho} | ${r.sugestao} pares`
    )
    const txt =
      `PEDIDO DE REPOSICAO\n` +
      `Cobertura desejada: ${cobertura} dias\n\n` +
      linhas.join('\n') +
      `\n\nTOTAL: ${totalPares} pares - ${brl(totalCusto)}`
    navigator.clipboard?.writeText(txt)
  }

  return (
    <Page>
      <PageHeader
        title="Painel do gestor"
        subtitle="Vendas reais do site, estoque da loja, lucro e contas — tudo integrado."
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
          {/* Alerta de ruptura */}
          {zerados > 0 && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
              <strong>{zerados} {zerados === 1 ? 'tamanho zerado' : 'tamanhos zerados'} com venda ativa.</strong>{' '}
              Você está perdendo venda agora. Veja a sugestão de pedido abaixo.
            </div>
          )}

          {/* Financeiro */}
          <section>
            <h2 className="font-display font-semibold text-ink/70 text-sm mb-2">Financeiro</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Faturamento" value={brl(kpi.faturamento)} big />
              <Kpi label="Lucro do que foi vendido" value={brl(kpi.lucro_geral)}
                hint="Faturamento − CMV − despesas − ativações"
                tone={kpi.lucro_geral >= 0 ? 'positivo' : 'negativo'} big />
              <Kpi label="Lucro total (vendido + estoque)" value={brl(lucroTotal)}
                hint="Faturamento − compra do vendido − compra do estoque"
                tone={lucroTotal >= 0 ? 'positivo' : 'negativo'} big />
              <Kpi label="Contas vencidas" value={brl(kpi.total_vencido)}
                tone={kpi.total_vencido > 0 ? 'negativo' : 'default'} big />

              <Kpi label="Lucro bruto (vendas)" value={brl(kpi.lucro_bruto)} hint="Faturamento − CMV"
                tone={kpi.lucro_bruto >= 0 ? 'positivo' : 'negativo'} />
              <Kpi label="CMV (custo do vendido)" value={brl(kpi.cmv)} />
              <Kpi label="Compra do estoque parado" value={brl(compraEstoque)}
                hint="o que ainda não vendeu" />
              <Kpi label="Total a pagar" value={brl(kpi.total_a_pagar)} hint={`${brl(kpi.vence_7)} vencem em 7 dias`} />

              <Kpi label="Ativações / marketing" value={brl(kpi.ativacoes)} />
              <Kpi label="Retiradas dos sócios" value={brl(kpi.retiradas)} hint="fora do resultado" />
            </div>
          </section>

          {/* Sugestão de reposição */}
          <section>
            <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <h2 className="font-display font-semibold text-ink/70 text-sm">
                Sugestão de pedido
                <span className="font-normal text-ink/40 ml-2">
                  baseada na venda dos últimos 30 dias
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink/50">Cobrir</span>
                <div className="flex gap-1 bg-white border border-borda rounded-md p-1">
                  {COBERTURAS.map((c) => (
                    <button key={c} onClick={() => setCobertura(c)}
                      className={`text-xs px-2 py-1 rounded ${
                        cobertura === c ? 'bg-ink text-white' : 'text-ink/60 hover:bg-ink/5'
                      }`}>
                      {c}d
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Card>
              {repo.length === 0 ? (
                <Empty>Calculando…</Empty>
              ) : listaRepo.length === 0 ? (
                <Empty>Nenhuma reposição necessária para cobrir {cobertura} dias.</Empty>
              ) : (
                <>
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-ink/45 text-[11px] uppercase tracking-wide">
                          <th className="pb-2 pr-2 font-medium">Produto</th>
                          <th className="pb-2 px-2 font-medium">Tam</th>
                          <th className="pb-2 px-2 font-medium text-right">Vendeu</th>
                          <th className="pb-2 px-2 font-medium text-right">Estoque</th>
                          <th className="pb-2 px-2 font-medium text-right">Base</th>
                          <th className="pb-2 px-2 font-medium text-right">Dura</th>
                          <th className="pb-2 px-2 font-medium text-right">Pedir</th>
                          <th className="pb-2 pl-2 font-medium text-right">Custo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listaRepo.map((r, i) => {
                          const p = PRIO[r.prioridade] || PRIO.OK
                          return (
                            <tr key={i} className="border-t border-borda/60">
                              <td className="py-2 pr-2">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${p.cls}`}>
                                    {p.txt}
                                  </span>
                                  <span className="text-ink/80">{r.produto}</span>
                                </div>
                              </td>
                              <td className="py-2 px-2 tnum text-ink/70">{r.tamanho}</td>
                              <td className="py-2 px-2 text-right tnum text-ink/70">{num(r.vendido)}</td>
                              <td className={`py-2 px-2 text-right tnum ${
                                Number(r.estoque) === 0 ? 'text-red-600 font-semibold' : 'text-ink/70'
                              }`}>
                                {num(r.estoque)}
                              </td>
                              <td className="py-2 px-2 text-right tnum text-ink/40">
                                {num(r.dias_disponivel)}d
                              </td>
                              <td className="py-2 px-2 text-right tnum text-ink/50">
                                {r.cobertura_dias == null
                                  ? '—'
                                  : Number(r.cobertura_dias) === 0
                                    ? 'acabou'
                                    : Math.round(Number(r.cobertura_dias)) + 'd'}
                              </td>
                              <td className="py-2 px-2 text-right font-display font-bold tnum">
                                {Number(r.sugestao) > 0 ? num(r.sugestao) : '—'}
                              </td>
                              <td className="py-2 pl-2 text-right tnum text-ink/60">
                                {Number(r.sugestao) > 0 ? brl(r.custo_sugestao) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-borda">
                          <td colSpan={6} className="pt-3 font-display font-semibold text-ink">
                            Total a pedir
                          </td>
                          <td className="pt-3 text-right font-display font-bold tnum">{num(totalPares)}</td>
                          <td className="pt-3 pl-2 text-right font-display font-bold tnum">{brl(totalCusto)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <p className="text-[11px] text-ink/40 mt-3 leading-relaxed">
                    <strong className="text-ink/55">Base</strong> = dias em que o tamanho esteve
                    realmente disponível. Quando um tamanho zera, ele para de vender — então a média
                    diária é calculada só sobre os dias em que havia estoque, e não sobre o período todo.
                    Sem isso, o que esgota rápido parece vender pouco.
                  </p>

                  <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
                    <button onClick={() => setVerTudo(!verTudo)}
                      className="text-xs text-ink/50 hover:text-ink underline">
                      {verTudo ? 'Mostrar só o que precisa pedir' : 'Ver todos os tamanhos'}
                    </button>
                    <button onClick={copiarPedido}
                      className="text-xs bg-ink text-white px-3 py-1.5 rounded hover:bg-ink/85">
                      Copiar pedido
                    </button>
                  </div>
                </>
              )}
            </Card>
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

          {/* Como o lucro total é formado */}
          <Card title="Como o lucro total é calculado">
            <div className="space-y-3 text-sm">
              <Linha rot="Faturamento" val={brl(kpi.faturamento)} />
              <Linha rot="− Compra dos produtos já vendidos" val={brl(compraVendidos)} />
              <Linha rot="− Compra das sandálias paradas no estoque" val={brl(compraEstoque)} />
              <div className="flex justify-between pt-1">
                <span className="font-display font-semibold text-ink">= Lucro total</span>
                <span className={`font-display font-bold tnum ${lucroTotal >= 0 ? 'text-positivo' : 'text-negativo'}`}>
                  {brl(lucroTotal)}
                </span>
              </div>
            </div>
          </Card>

          {/* Estoque + Compras */}
          <div className="grid md:grid-cols-3 gap-6">
            <Card title="Estoque">
              <div className="space-y-3 text-sm">
                <Linha rot="Valor em estoque (custo)" val={brl(kpi.estoque_custo)} />
                <Linha rot="Valor de compra do estoque" val={brl(compraEstoque)} />
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
