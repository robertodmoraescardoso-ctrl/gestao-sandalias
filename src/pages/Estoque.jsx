import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { brl, num, dataBR } from '../lib/format'
import { Page, PageHeader, Card, Badge, Empty, Kpi, inputCls } from '../components/ui'

/* Aviso de falha de carregamento.
   Sem isto, consulta que falha cai no `data || []` e a tela mostra "nenhum
   registro" — idêntico a não ter nenhum. Numa tela de decisão isso é pior que
   um erro visível. */
function ErroCarga({ msg }) {
  if (!msg) return null
  return (
    <div className="bg-alerta/10 text-alerta text-sm rounded-md p-3 mb-4">
      Não foi possível carregar: {msg}
      <div className="text-xs mt-1 text-alerta/80">
        O que aparece abaixo pode estar incompleto. Recarregue a página antes de decidir qualquer coisa.
      </div>
    </div>
  )
}

export default function Estoque() {
  const [aba, setAba] = useState('produtos')
  return (
    <Page>
      <PageHeader title="Estoque" subtitle="Estoque físico, em trânsito, custo e giro por produto." />
      <div className="flex gap-1 mb-5 bg-white border border-borda rounded-md p-1 w-fit">
        {[['produtos', 'Produtos'], ['movimentacoes', 'Movimentações']].map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`text-sm px-3 py-1.5 rounded ${aba === k ? 'bg-ink text-white' : 'text-ink/60'}`}>{l}</button>
        ))}
      </div>
      {aba === 'produtos' && <ProdutosEstoque />}
      {aba === 'movimentacoes' && <Movimentacoes />}
    </Page>
  )
}

function ProdutosEstoque() {
  const [rows, setRows] = useState([])
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('v_estoque').select('*').order('nome').then(({ data, error }) => {
      setErro(error ? error.message : null)
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

  /* Totais do estoque inteiro, não só do que está filtrado na tabela.
     São os três números que interessam de manhã: quantos pares existem,
     quanto eles custaram e quanto sobra se tudo for vendido pelo preço atual. */
  const totPares = rows.reduce((s, r) => s + Number(r.disponivel || 0), 0)
  const totTransito = rows.reduce((s, r) => s + Number(r.em_transito || 0), 0)
  const totCusto = rows.reduce((s, r) => s + Number(r.valor_custo || 0), 0)
  const totPot = rows.reduce((s, r) => s + Number(r.valor_potencial || 0), 0)
  const ganhoPot = totPot - totCusto
  const margemPot = totPot > 0 ? (ganhoPot / totPot) * 100 : null

  /* Totais só do que está na tela, para conferir pedido e contagem por filtro. */
  const visPares = visiveis.reduce((s, r) => s + Number(r.disponivel || 0), 0)
  const visCusto = visiveis.reduce((s, r) => s + Number(r.valor_custo || 0), 0)
  const visVendido = visiveis.reduce((s, r) => s + Number(r.total_vendido || 0), 0)
  const filtrando = filtro !== 'todos' || busca.trim() !== ''

  return (
    <>
      <ErroCarga msg={erro} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Pares disponíveis" value={num(totPares)} big
          hint={totTransito > 0 ? `+ ${num(totTransito)} a caminho` : 'em mãos agora'} />
        <Kpi label="Preço do estoque" value={brl(totCusto)} big
          hint="o que você pagou pelo que está parado" />
        <Kpi label="Ganho potencial" value={brl(ganhoPot)} big
          tone={ganhoPot >= 0 ? 'positivo' : 'negativo'}
          hint={margemPot === null
            ? 'sem estoque para vender'
            : `${brl(totPot)} de venda − ${brl(totCusto)} de custo · margem ${margemPot.toFixed(1)}%`} />
        <Kpi label="Produtos com estoque baixo" value={num(rows.filter(baixo).length)}
          tone={rows.filter(baixo).length ? 'negativo' : 'default'}
          hint={`de ${num(rows.length)} produtos ativos`} />
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
              <tfoot>
                <tr className="border-t-2 border-borda font-medium">
                  <td className="py-2 pr-3 text-ink/60">
                    {filtrando ? `Soma do filtro (${visiveis.length} de ${rows.length})` : `Total (${rows.length} produtos)`}
                  </td>
                  <td className="py-2 px-3 text-right tnum">{num(visPares)}</td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 px-3 text-right tnum">{brl(visCusto)}</td>
                  <td className="py-2 px-3 text-right tnum">{num(visVendido)}</td>
                  <td className="py-2 px-3"></td>
                  <td className="py-2 pl-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}

/* Histórico de movimentação de estoque (frente B, etapa 6).
   Só leitura. Depende da tabela `movimentacoes_estoque`, criada pela etapa 1.
   Enquanto a tabela não existir, o ErroCarga mostra a mensagem do banco em vez
   de fingir que não há movimento. */
const tipoBadge = {
  recebimento: ['verde', 'Recebimento'],
  venda: ['azul', 'Venda'],
  ativacao: ['amarelo', 'Ativação'],
  ajuste: ['neutro', 'Ajuste'],
  cancelamento: ['vermelho', 'Cancelamento'],
}

function dataHora(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function Movimentacoes() {
  const [rows, setRows] = useState([])
  const [tipo, setTipo] = useState('todos')
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('movimentacoes_estoque')
      .select('*, produtos(nome, cod)')
      .order('criado_em', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        setErro(error ? error.message : null)
        setRows(data || [])
        setLoading(false)
      })
  }, [])

  const visiveis = rows.filter((r) => {
    if (tipo !== 'todos' && r.tipo !== tipo) return false
    if (busca) {
      const alvo = `${r.produtos?.nome || ''} ${r.produtos?.cod || ''} ${r.tamanho || ''}`.toLowerCase()
      if (!alvo.includes(busca.toLowerCase())) return false
    }
    return true
  })

  const entradas = visiveis.filter((r) => r.quantidade > 0).reduce((s, r) => s + r.quantidade, 0)
  const saidas = visiveis.filter((r) => r.quantidade < 0).reduce((s, r) => s + r.quantidade, 0)

  return (
    <>
      <ErroCarga msg={erro} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <Kpi label="Entradas" value={num(entradas)} big tone="positivo"
          hint="pares que entraram no filtro atual" />
        <Kpi label="Saídas" value={num(Math.abs(saidas))} big tone="negativo"
          hint="pares que saíram no filtro atual" />
        <Kpi label="Saldo do período" value={num(entradas + saidas)}
          tone={entradas + saidas >= 0 ? 'positivo' : 'negativo'}
          hint={`${num(visiveis.length)} movimentações`} />
      </div>

      <Card
        title="Movimentações"
        right={
          <div className="flex gap-2 items-center">
            <input className={inputCls + ' !py-1.5 !w-44'} placeholder="Produto ou grade…"
              value={busca} onChange={(e) => setBusca(e.target.value)} />
            <select className={inputCls + ' !py-1.5 !w-40'} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="todos">Todos os tipos</option>
              <option value="recebimento">Recebimento</option>
              <option value="venda">Venda</option>
              <option value="ativacao">Ativação</option>
              <option value="ajuste">Ajuste</option>
              <option value="cancelamento">Cancelamento</option>
            </select>
          </div>
        }
      >
        {loading ? <Empty>Carregando…</Empty> : visiveis.length === 0 ? (
          <Empty>
            Nenhuma movimentação registrada. O histórico começa a ser gravado depois que os
            gatilhos do banco forem ajustados (etapa 3 do plano).
          </Empty>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink/45 text-xs border-b border-borda">
                  <th className="py-2 pr-3">Quando</th>
                  <th className="py-2 px-3">Produto</th>
                  <th className="py-2 px-3">Grade</th>
                  <th className="py-2 px-3">Tipo</th>
                  <th className="py-2 px-3 text-right">Qtd</th>
                  <th className="py-2 px-3 text-right">Saldo depois</th>
                  <th className="py-2 px-3">Referência</th>
                  <th className="py-2 pl-3">Observação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((r) => {
                  const [tone, label] = tipoBadge[r.tipo] || ['neutro', r.tipo]
                  return (
                    <tr key={r.id} className="border-b border-borda/50">
                      <td className="py-2 pr-3 text-ink/60 whitespace-nowrap">{dataHora(r.criado_em)}</td>
                      <td className="py-2 px-3">
                        <div className="font-medium">{r.produtos?.nome || '—'}</div>
                        {r.produtos?.cod && <div className="text-[11px] text-ink/45">{r.produtos.cod}</div>}
                      </td>
                      <td className="py-2 px-3 text-ink/60">{r.tamanho}</td>
                      <td className="py-2 px-3"><Badge tone={tone}>{label}</Badge></td>
                      <td className={`py-2 px-3 text-right tnum font-medium ${r.quantidade > 0 ? 'text-esmeralda' : 'text-alerta'}`}>
                        {r.quantidade > 0 ? '+' : ''}{num(r.quantidade)}
                      </td>
                      <td className="py-2 px-3 text-right tnum text-ink/60">
                        {r.saldo_depois === null || r.saldo_depois === undefined ? '—' : num(r.saldo_depois)}
                      </td>
                      <td className="py-2 px-3 text-ink/50 text-[12px]">{r.referencia || '—'}</td>
                      <td className="py-2 pl-3 text-ink/45 text-[11px] max-w-[260px]">{r.observacao || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length >= 500 && (
              <div className="text-[11px] text-ink/45 mt-3 pt-3 border-t border-borda">
                Mostrando as 500 movimentações mais recentes.
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  )
}
