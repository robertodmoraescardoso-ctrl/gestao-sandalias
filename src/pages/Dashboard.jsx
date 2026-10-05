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

  const [saude, setSaude] = useState(null)

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
      supabase.rpc('fn_indicadores_gestor', { p_inicio: inicio, p_fim: fim }),
    ])
      .then(([d, t, s, g]) => {
        if (d.error) throw d.error
        setKpi(d.data)
        // Indicador novo: se a função ainda não existir no banco, o painel
        // segue funcionando sem a seção, em vez de quebrar a tela inteira.
        if (!g.error) setSaude(g.data)
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
        subtitle="Vendas reais do site, já líquidas da taxa do cartão, estoque, lucro e contas."
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
              <Kpi label="Faturamento" value={brl(kpi.faturamento)} big
                hint={Number(kpi.taxas_cartao) > 0
                  ? `${brl(kpi.faturamento_bruto)} vendidos − ${brl(kpi.taxas_cartao)} de taxa do cartão`
                  : 'o que de fato entrou na conta'} />
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
              <Kpi label="Taxas de cartão" value={brl(kpi.taxas_cartao)}
                hint="retidas pela InfinitePay, já fora do faturamento"
                tone={Number(kpi.taxas_cartao) > 0 ? 'negativo' : 'default'} />
              <Kpi label="Compra do estoque parado" value={brl(compraEstoque)}
                hint="o que ainda não vendeu" />
              <Kpi label="Total a pagar" value={brl(kpi.total_a_pagar)} hint={`${brl(kpi.vence_7)} vencem em 7 dias`} />

              <Kpi label="Ativações / marketing" value={brl(kpi.ativacoes)} />
              <Kpi label="Retiradas dos sócios" value={brl(kpi.retiradas)} hint="fora do resultado" />
            </div>
          </section>

          {/* Quanto o sócio pode retirar */}
          <RetiradaSocio />

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
              {Number(kpi.taxas_cartao) > 0 && (
                <>
                  <Linha rot="Vendas no período (bruto)" val={brl(kpi.faturamento_bruto)} />
                  <Linha rot="− Taxa da InfinitePay" val={brl(kpi.taxas_cartao)} />
                </>
              )}
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

          {/* Saúde do negócio — indicadores de varejo com referência do setor */}
          {saude && (
            <section>
              <h2 className="font-display font-semibold text-ink/70 text-sm mb-1">Saúde do negócio</h2>
              <p className="text-ink/45 text-xs mb-3">
                Comparado com a referência do varejo de moda. Giro e GMROI usam o estoque de
                hoje como base — servem para comparar produtos, não períodos.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Indicador
                  rot="Dinheiro parado"
                  val={`${saude.estoque_parado_pct}%`}
                  sub={`${brl(saude.estoque_parado_valor)} em numeração que não vendeu`}
                  referencia="ideal: abaixo de 5%"
                  estado={saude.estoque_parado_pct <= 5 ? 'bom' : saude.estoque_parado_pct <= 15 ? 'atencao' : 'ruim'}
                />
                <Indicador
                  rot="Giro do estoque"
                  val={`${saude.giro_anual}×`}
                  sub={saude.cobertura_dias ? `o estoque de hoje dura ${saude.cobertura_dias} dias` : '—'}
                  referencia="saudável: 3× a 6× ao ano"
                  estado={saude.giro_anual >= 3 && saude.giro_anual <= 8 ? 'bom' : saude.giro_anual < 3 ? 'ruim' : 'atencao'}
                />
                <Indicador
                  rot="GMROI"
                  val={`${saude.gmroi}`}
                  sub="margem que cada R$ 1 em estoque devolve por ano"
                  referencia="mínimo aceitável: 2,0"
                  estado={saude.gmroi >= 2 ? 'bom' : saude.gmroi >= 1 ? 'atencao' : 'ruim'}
                />
                <Indicador
                  rot="Clientes que voltam"
                  val={`${saude.recompra_pct}%`}
                  sub={`${saude.clientes_recorrentes} de ${saude.clientes_total} clientes`}
                  referencia="referência do setor: 25% a 30%"
                  estado={saude.recompra_pct >= 25 ? 'bom' : saude.recompra_pct >= 15 ? 'atencao' : 'ruim'}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6 mt-4">
                <Card title="Quanto vale um cliente que volta">
                  <div className="space-y-3 text-sm">
                    <Linha rot="Gasto de quem comprou uma vez" val={brl(saude.gasto_cliente_1x)} />
                    <Linha rot="Gasto de quem voltou" val={brl(saude.gasto_cliente_recorrente)} />
                    {saude.gasto_cliente_1x > 0 && (
                      <p className="text-ink/60 text-[13px] leading-relaxed pt-1">
                        Quem volta gasta{' '}
                        <b className="text-ink">
                          {(saude.gasto_cliente_recorrente / saude.gasto_cliente_1x).toFixed(1)}×
                        </b>{' '}
                        mais que quem compra uma única vez. Trazer um cliente de volta rende
                        mais do que achar um novo.
                      </p>
                    )}
                  </div>
                </Card>

                <Card title="Giro das peças no período">
                  <div className="space-y-3 text-sm">
                    <Linha rot="Pares vendidos" val={num(saude.pares_vendidos)} />
                    <Linha rot="Pares parados em estoque" val={num(saude.pares_estoque)} />
                    <Linha rot="Saíram das suas mãos" val={`${saude.sell_through_pct}%`} />
                    {saude.rupturas > 0 && (
                      <p className="text-alerta text-[13px] leading-relaxed pt-1">
                        <b>{saude.rupturas} {saude.rupturas === 1 ? 'numeração zerada' : 'numerações zeradas'}</b> que
                        vinham vendendo. Cada dia assim é venda perdida — veja a sugestão de reposição abaixo.
                      </p>
                    )}
                  </div>
                </Card>
              </div>
            </section>
          )}

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

/* Indicador com referência do setor: número sozinho não diz se está bom.
   O estado colore a borda para o gestor achar o problema de relance. */
function Indicador({ rot, val, sub, referencia, estado }) {
  const cor = {
    bom: 'border-l-esmeralda',
    atencao: 'border-l-amber-400',
    ruim: 'border-l-alerta',
  }[estado] || 'border-l-borda'

  const corTexto = {
    bom: 'text-esmeralda',
    atencao: 'text-amber-600',
    ruim: 'text-alerta',
  }[estado] || 'text-ink'

  return (
    <div className={`bg-white rounded-lg border border-borda border-l-4 ${cor} p-4`}>
      <div className="text-[11px] uppercase tracking-wide text-ink/45">{rot}</div>
      <div className={`font-display font-bold tnum text-2xl mt-1.5 ${corTexto}`}>{val}</div>
      {sub && <div className="text-[11px] text-ink/55 mt-1 leading-snug">{sub}</div>}
      {referencia && <div className="text-[11px] text-ink/35 mt-1.5 italic">{referencia}</div>}
    </div>
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

/* ------------------------------------------------------------------
   Retirada do sócio x caixa da empresa
   Regra usada (prática comum no pequeno varejo):
   1) Primeiro separa o que é da empresa: contas a pagar em aberto
      + reserva de segurança (% do faturamento dos últimos 30 dias).
   2) Do lucro dos últimos 30 dias, só uma parte vai para o sócio
      (o resto fica para a empresa crescer / repor estoque).
   3) A sugestão é o MENOR dos dois limites, arredondado para baixo
      em múltiplos de R$ 10, já descontando o que foi retirado em 30 dias.
   O cálculo é feito no banco pela função fn_sugestao_retirada.
------------------------------------------------------------------- */
function lerConfig() {
  try {
    const c = JSON.parse(localStorage.getItem('cfg_retirada') || '{}')
    return { pctLucro: c.pctLucro ?? 50, pctReserva: c.pctReserva ?? 15, saldo: c.saldo ?? '' }
  } catch {
    return { pctLucro: 50, pctReserva: 15, saldo: '' }
  }
}

function RetiradaSocio() {
  const [cfg, setCfg] = useState(lerConfig)
  const [r, setR] = useState(null)
  const [erro, setErro] = useState(null)
  const [ajustes, setAjustes] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('cfg_retirada', JSON.stringify(cfg)) } catch {}
    const saldo = String(cfg.saldo).replace(/\./g, '').replace(',', '.').trim()
    const t = setTimeout(() => {
      supabase
        .rpc('fn_sugestao_retirada', {
          p_pct_lucro: Number(cfg.pctLucro) || 0,
          p_pct_reserva: Number(cfg.pctReserva) || 0,
          p_saldo_real: saldo === '' || isNaN(Number(saldo)) ? null : Number(saldo),
        })
        .then(({ data, error }) => {
          if (error) { setErro(error.message); return }
          setErro(null)
          setR(data)
        })
    }, 400)
    return () => clearTimeout(t)
  }, [cfg])

  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value })

  if (erro) {
    return (
      <div className="bg-alerta/10 text-alerta text-sm rounded-md p-3">
        Retirada do sócio indisponível: {erro}
      </div>
    )
  }
  if (!r) return null

  const sug = Number(r.sugestao)
  const semDespesas = Number(r.despesas) === 0 && Number(r.ativacoes) === 0
  const sobraAposContas = Number(r.caixa_apos_retirada) - Number(r.contas_pendentes)
  const faltaRepor = Number(r.reposicao_30d) > sobraAposContas
  const limitadoPor = Number(r.livre) < Number(r.teto_lucro) ? 'caixa' : 'lucro'

  return (
    <section>
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <h2 className="font-display font-semibold text-ink/70 text-sm">
          Retirada do sócio x caixa da empresa
        </h2>
        <button onClick={() => setAjustes(!ajustes)}
          className="text-xs text-ink/50 hover:text-ink underline">
          {ajustes ? 'Fechar ajustes' : 'Ajustar regra / informar saldo do banco'}
        </button>
      </div>

      {ajustes && (
        <div className="bg-white border border-borda rounded-lg p-4 mb-3 grid md:grid-cols-3 gap-4 text-sm">
          <label className="block">
            <span className="block text-xs text-ink/60 mb-1">Saldo real na conta da Beblue (R$)</span>
            <input value={cfg.saldo} onChange={set('saldo')} inputMode="decimal" placeholder="vazio = usar o estimado"
              className="w-full border border-borda rounded-md px-3 py-2 bg-white focus:outline-none focus:border-ink/40" />
            <span className="block text-[11px] text-ink/40 mt-1">Mais preciso que o estimado. Ex.: 5230,50</span>
          </label>
          <label className="block">
            <span className="block text-xs text-ink/60 mb-1">Parte do lucro para o sócio: <b>{cfg.pctLucro}%</b></span>
            <input type="range" min="0" max="80" step="5" value={cfg.pctLucro} onChange={set('pctLucro')} className="w-full" />
            <span className="block text-[11px] text-ink/40 mt-1">Mercado: 30% a 50% enquanto a loja cresce</span>
          </label>
          <label className="block">
            <span className="block text-xs text-ink/60 mb-1">Reserva de segurança: <b>{cfg.pctReserva}%</b> do faturamento de 30 dias</span>
            <input type="range" min="0" max="50" step="5" value={cfg.pctReserva} onChange={set('pctReserva')} className="w-full" />
            <span className="block text-[11px] text-ink/40 mt-1">Mercado: 10% a 20% (cobre imprevisto e mês fraco)</span>
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi label="Pode retirar agora" value={brl(sug)} big tone={sug > 0 ? 'positivo' : 'negativo'}
          hint={sug > 0
            ? `limitado pelo ${limitadoPor === 'caixa' ? 'caixa livre' : 'lucro dos últimos 30 dias'}`
            : 'não retire agora — o caixa precisa ficar na empresa'} />
        <Kpi label="Manter no caixa (mínimo)" value={brl(r.manter_no_caixa)} big
          hint={`${brl(r.contas_pendentes)} de contas + ${brl(r.reserva_seguranca)} de reserva`} />
        <Kpi label="Caixa depois da retirada" value={brl(r.caixa_apos_retirada)} big
          hint={r.usou_saldo_real ? 'a partir do saldo que você informou' : 'caixa estimado pelo painel'} />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-4">
        <Card title="1º limite: o caixa">
          <div className="space-y-3 text-sm">
            {r.usou_saldo_real ? (
              <Linha rot="Saldo informado na conta" val={brl(r.caixa)} />
            ) : (
              <>
                <Linha rot="Tudo o que entrou de vendas" val={brl(r.entradas)} />
                <Linha rot="− Pago a fornecedores" val={brl(r.pago_fornecedores)} />
                <Linha rot="− Despesas e ativações" val={brl(Number(r.despesas) + Number(r.ativacoes))} />
                <Linha rot="− Retiradas já feitas" val={brl(r.retiradas)} />
                <Linha rot="= Caixa estimado" val={brl(r.caixa)} />
              </>
            )}
            <Linha rot="− Contas a pagar em aberto" val={brl(r.contas_pendentes)} />
            <Linha rot={`− Reserva de segurança (${r.pct_reserva}%)`} val={brl(r.reserva_seguranca)} />
            <div className="flex justify-between pt-1">
              <span className="font-display font-semibold text-ink">= Caixa livre</span>
              <span className={`font-display font-bold tnum ${Number(r.livre) >= 0 ? 'text-positivo' : 'text-negativo'}`}>
                {brl(r.livre)}
              </span>
            </div>
          </div>
        </Card>

        <Card title="2º limite: o lucro">
          <div className="space-y-3 text-sm">
            <Linha rot="Lucro dos últimos 30 dias" val={brl(r.lucro_30d)} />
            <Linha rot={`× Parte do sócio (${r.pct_lucro}%)`} val={brl(Number(r.lucro_30d) * Number(r.pct_lucro) / 100)} />
            <Linha rot="− Já retirado nos últimos 30 dias" val={brl(r.retirado_30d)} />
            <div className="flex justify-between pt-1">
              <span className="font-display font-semibold text-ink">= Teto pelo lucro</span>
              <span className="font-display font-bold tnum">{brl(r.teto_lucro)}</span>
            </div>
            <p className="text-[12px] text-ink/50 leading-relaxed pt-1">
              A sugestão é o <b>menor</b> dos dois limites, arredondado para baixo de R$ 10 em R$ 10.
              Retire sempre por transferência da conta da Beblue e lance em Financeiro → Retiradas
              para o painel descontar do caixa.
            </p>
          </div>
        </Card>
      </div>

      {(semDespesas || faltaRepor) && (
        <div className="mt-3 space-y-2">
          {semDespesas && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 text-[13px]">
              <b>Nenhuma despesa ou ativação lançada.</b> O lucro está sem custos como frete, embalagem,
              DAS do MEI e anúncios, então a sugestão pode estar alta. Lance-os em Financeiro → Despesas.
            </div>
          )}
          {faltaRepor && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-3 text-[13px]">
              <b>A reposição sugerida custa {brl(r.reposicao_30d)}</b> e, depois de pagar as contas em aberto,
              sobrariam {brl(sobraAposContas)}. Se o próximo pedido for à vista, retire menos ou espere a reposição.
            </div>
          )}
        </div>
      )}
    </section>
  )
}
