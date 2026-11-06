import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { brl, dataBR, hoje } from '../lib/format'
import { Page, PageHeader, Card, Button, Badge, Kpi, Field, inputCls, Empty } from '../components/ui'
import Modal from '../components/Modal.jsx'

/* Aviso de falha de carregamento.
   Sem isto, consulta que falha (view ausente, permissão, sessão expirada) cai no
   `data || []` e a tela mostra "nenhum registro" — indistinguível de não ter
   mesmo nenhum registro. Numa tela de decisão isso é pior que erro na cara. */
function ErroCarga({ msg }) {
  if (!msg) return null
  return (
    <div className="bg-alerta/10 text-alerta text-sm rounded-md p-3 mb-4">
      Não foi possível carregar os dados desta aba: {msg}
      <div className="text-xs mt-1 text-alerta/80">
        O que aparece abaixo pode estar incompleto. Recarregue a página antes de decidir qualquer coisa.
      </div>
    </div>
  )
}

export default function Financeiro() {
  const [aba, setAba] = useState('pagar')
  return (
    <Page>
      <PageHeader title="Financeiro" subtitle="Contas a pagar, retiradas dos sócios e despesas operacionais." />
      <div className="flex gap-1 mb-5 bg-white border border-borda rounded-md p-1 w-fit">
        {[['pagar', 'Contas a pagar'], ['retiradas', 'Retiradas dos sócios'], ['despesas', 'Despesas']].map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`text-sm px-3 py-1.5 rounded ${aba === k ? 'bg-ink text-white' : 'text-ink/60'}`}>{l}</button>
        ))}
      </div>
      {aba === 'pagar' && <ContasPagar />}
      {aba === 'retiradas' && <Retiradas />}
      {aba === 'despesas' && <Despesas />}
    </Page>
  )
}

function ContasPagar() {
  const [rows, setRows] = useState([])
  const [filtro, setFiltro] = useState('todas')
  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => supabase.from('v_contas_pagar').select('*')
    .order('data_vencimento').then(({ data, error }) => {
      setErro(error ? error.message : null)
      setRows(data || [])
      setLoading(false)
    })
  useEffect(() => { load() }, [])

  const pagar = async (id) => {
    if (!confirm('Marcar esta conta como paga?')) return
    const { error } = await supabase.from('contas_pagar')
      .update({ status: 'pago', data_pagamento: hoje() }).eq('id', id)
    if (error) return alert(error.message)
    load()
  }

  const pend = rows.filter((r) => r.status !== 'pago')
  const soma = (fn) => pend.filter(fn).reduce((s, r) => s + Number(r.valor), 0)
  const total = soma(() => true)
  const vencido = soma((r) => r.status_efetivo === 'atrasado')
  const v7 = soma((r) => r.dias_restantes >= 0 && r.dias_restantes <= 7)
  const v30 = soma((r) => r.dias_restantes >= 0 && r.dias_restantes <= 30)

  const visiveis = rows.filter((r) =>
    filtro === 'todas' ? true :
    filtro === 'pago' ? r.status === 'pago' :
    r.status_efetivo === filtro)

  const tone = { atrasado: 'vermelho', pendente: 'amarelo', pago: 'verde' }

  return (
    <>
      <ErroCarga msg={erro} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Total a pagar" value={brl(total)} big />
        <Kpi label="Vencido" value={brl(vencido)} tone={vencido ? 'negativo' : 'default'} big />
        <Kpi label="Vence em 7 dias" value={brl(v7)} />
        <Kpi label="Vence em 30 dias" value={brl(v30)} />
      </div>
      <Card title="Boletos e obrigações" right={
        <select className={inputCls + ' !py-1.5 !w-40'} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todas">Todas</option>
          <option value="pendente">Pendentes</option>
          <option value="atrasado">Atrasadas</option>
          <option value="pago">Pagas</option>
        </select>
      }>
        {loading ? <Empty>Carregando…</Empty> : visiveis.length === 0 ? (
          <Empty>Nenhuma conta. Elas aparecem aqui automaticamente ao registrar recebimentos.</Empty>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink/45 text-xs border-b border-borda">
                <th className="py-2 pr-3">Fornecedor</th><th className="py-2 px-3">Recebido</th>
                <th className="py-2 px-3">Vencimento</th><th className="py-2 px-3 text-right">Valor</th>
                <th className="py-2 px-3">Prazo</th><th className="py-2 px-3">Status</th><th className="py-2 pl-3"></th>
              </tr></thead>
              <tbody>{visiveis.map((r) => (
                <tr key={r.id} className="border-b border-borda/50">
                  <td className="py-2 pr-3 font-medium">{r.fornecedor_nome || '—'}</td>
                  <td className="py-2 px-3 text-ink/60">{dataBR(r.data_recebimento)}</td>
                  <td className="py-2 px-3 text-ink/60">{dataBR(r.data_vencimento)}</td>
                  <td className="py-2 px-3 text-right tnum">{brl(r.valor)}</td>
                  <td className="py-2 px-3 text-ink/60">
                    {r.status === 'pago' ? '—' : r.dias_restantes < 0 ? `${-r.dias_restantes}d atrás` : `${r.dias_restantes}d`}
                  </td>
                  <td className="py-2 px-3"><Badge tone={tone[r.status_efetivo]}>{r.status_efetivo}</Badge></td>
                  <td className="py-2 pl-3 text-right">
                    {r.status !== 'pago' && <Button variant="ghost" onClick={() => pagar(r.id)}>Dar baixa</Button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}

const RETIRADA_VAZIA = { data: hoje(), socio: '', valor: '', descricao: '', forma_pagamento: '', observacao: '' }

function Retiradas() {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [f, setF] = useState(RETIRADA_VAZIA)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState(null)
  const [cancelando, setCancelando] = useState(null)
  const [verCanceladas, setVerCanceladas] = useState(false)

  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => supabase.from('retiradas_socios').select('*').order('data', { ascending: false })
    .then(({ data, error }) => {
      setErro(error ? error.message : null)
      setRows(data || [])
      setLoading(false)
    })
  useEffect(() => { load() }, [])

  const abrirNova = () => { setEditandoId(null); setF(RETIRADA_VAZIA); setErroForm(null); setOpen(true) }

  const abrirEdicao = (r) => {
    setEditandoId(r.id)
    setF({
      data: r.data || hoje(),
      socio: r.socio || '',
      valor: r.valor ?? '',
      descricao: r.descricao || '',
      forma_pagamento: r.forma_pagamento || '',
      observacao: r.observacao || '',
    })
    setErroForm(null); setOpen(true)
  }

  const fechar = () => { setOpen(false); setEditandoId(null); setErroForm(null) }

  const salvar = async () => {
    if (!f.socio || !f.valor) return setErroForm('Informe sócio e valor.')
    setErroForm(null); setSalvando(true)
    const dados = { ...f, valor: Number(f.valor) }
    const { error } = editandoId
      ? await supabase.from('retiradas_socios').update(dados).eq('id', editandoId)
      : await supabase.from('retiradas_socios').insert(dados)
    setSalvando(false)
    if (error) return setErroForm(error.message)
    fechar(); setF(RETIRADA_VAZIA); load()
  }

  const reativar = async (r) => {
    if (!confirm(`Reativar a retirada de ${brl(r.valor)} de ${r.socio}? Ela volta a contar no caixa.`)) return
    const { error } = await supabase.from('retiradas_socios')
      .update({ cancelada: false, cancelada_em: null, cancelada_motivo: null }).eq('id', r.id)
    if (error) return alert(error.message)
    load()
  }

  const ativas = rows.filter((r) => !r.cancelada)
  const canceladas = rows.filter((r) => r.cancelada)
  const visiveis = verCanceladas ? rows : ativas
  const total = ativas.reduce((s, r) => s + Number(r.valor), 0)

  return (
    <>
      <ErroCarga msg={erro} />
      <div className="bg-white border border-borda rounded-md p-3 mb-6 text-sm text-ink/60">
        Retiradas ficam <b>fora</b> do cálculo de lucro e despesas — elas reduzem apenas o caixa disponível.
        Total retirado: <b className="tnum text-ink">{brl(total)}</b>
        {canceladas.length > 0 && (
          <> · {canceladas.length} cancelada{canceladas.length > 1 ? 's' : ''}, fora desse total</>
        )}
      </div>
      <Card title="Retiradas dos sócios" right={
        <div className="flex items-center gap-3">
          {canceladas.length > 0 && (
            <label className="text-xs text-ink/60 flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={verCanceladas} onChange={(e) => setVerCanceladas(e.target.checked)} />
              Mostrar canceladas
            </label>
          )}
          <Button onClick={abrirNova}>Nova retirada</Button>
        </div>
      }>
        {loading ? <Empty>Carregando…</Empty> : visiveis.length === 0 ? (
          <Empty>Nenhuma retirada registrada.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ink/45 text-xs border-b border-borda">
              <th className="py-2 pr-3">Data</th><th className="py-2 px-3">Sócio</th>
              <th className="py-2 px-3">Motivo</th><th className="py-2 px-3">Forma</th>
              <th className="py-2 px-3 text-right">Valor</th><th className="py-2 pl-3"></th>
            </tr></thead>
            <tbody>{visiveis.map((r) => (
              <tr key={r.id} className={'border-b border-borda/50' + (r.cancelada ? ' text-ink/35' : '')}>
                <td className="py-2 pr-3 text-ink/60">{dataBR(r.data)}</td>
                <td className={'py-2 px-3' + (r.cancelada ? ' line-through' : ' font-medium')}>{r.socio}</td>
                <td className="py-2 px-3 text-ink/60">
                  <span className={r.cancelada ? 'line-through' : ''}>{r.descricao || '—'}</span>
                  {r.cancelada && (
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge tone="vermelho">cancelada</Badge>
                      {r.cancelada_motivo && <span className="text-[11px] text-ink/45">{r.cancelada_motivo}</span>}
                    </div>
                  )}
                </td>
                <td className="py-2 px-3 text-ink/60">{r.forma_pagamento || '—'}</td>
                <td className={'py-2 px-3 text-right tnum' + (r.cancelada ? ' line-through' : '')}>{brl(r.valor)}</td>
                <td className="py-2 pl-3 text-right whitespace-nowrap">
                  {r.cancelada ? (
                    <button type="button" onClick={() => reativar(r)}
                      className="text-xs font-medium text-ink/70 hover:text-ink px-2 py-1 rounded hover:bg-ink/5">
                      Reativar
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => abrirEdicao(r)}
                        className="text-xs font-medium text-ink/70 hover:text-ink px-2 py-1 rounded hover:bg-ink/5 mr-1">
                        Editar
                      </button>
                      <button type="button" onClick={() => setCancelando(r)}
                        className="text-xs font-medium text-ink/70 hover:text-alerta px-2 py-1 rounded hover:bg-alerta/5">
                        Cancelar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <Modal open={open} onClose={fechar} title={editandoId ? 'Editar retirada' : 'Nova retirada'}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data"><input type="date" className={inputCls} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Field>
              <Field label="Sócio"><input className={inputCls} value={f.socio} onChange={(e) => setF({ ...f, socio: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor"><input type="number" step="0.01" className={inputCls} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Field>
              <Field label="Forma de pagamento"><input className={inputCls} value={f.forma_pagamento} onChange={(e) => setF({ ...f, forma_pagamento: e.target.value })} /></Field>
            </div>
            <Field label="Motivo / descrição"><input className={inputCls} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Field>
            <Field label="Observação"><input className={inputCls} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></Field>
            {editandoId && (
              <p className="text-xs text-ink/45">
                Alterar o valor muda o caixa disponível e a sugestão de retirada do Dashboard.
                O lucro não é afetado — retirada nunca entrou nele.
              </p>
            )}
            {erroForm && <div className="bg-alerta/10 text-alerta text-sm rounded-md p-3">{erroForm}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={fechar}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
            </div>
          </div>
        </Modal>
      </Card>

      {cancelando && (
        <CancelarRetirada retirada={cancelando}
          onClose={() => setCancelando(null)}
          onSaved={() => { setCancelando(null); load() }} />
      )}
    </>
  )
}

/* Cancelamento, nao exclusao. A linha fica no banco com cancelada = true, sai
   do total da tela e deixa de contar na fn_dashboard e na fn_sugestao_retirada
   (migracao 0007). Regra 8: dinheiro que saiu do caixa nao se apaga, se estorna. */
function CancelarRetirada({ retirada, onClose, onSaved }) {
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  const confirmar = async () => {
    setErro(null); setSalvando(true)
    const { error } = await supabase.from('retiradas_socios').update({
      cancelada: true,
      cancelada_em: new Date().toISOString(),
      cancelada_motivo: motivo.trim() || null,
    }).eq('id', retirada.id)
    setSalvando(false)
    if (error) {
      return setErro(/cancelada/i.test(error.message)
        ? 'A coluna de cancelamento ainda não existe no banco. Rode a migração 0007_cancelar_retirada.sql no SQL Editor do Supabase.'
        : error.message)
    }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="Cancelar retirada">
      <div className="space-y-3">
        <div className="border border-borda rounded-md p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-ink/50">Data</span><b>{dataBR(retirada.data)}</b></div>
          <div className="flex justify-between"><span className="text-ink/50">Sócio</span><b>{retirada.socio}</b></div>
          <div className="flex justify-between"><span className="text-ink/50">Valor</span><b className="tnum">{brl(retirada.valor)}</b></div>
        </div>

        <Field label="Por que está cancelando?">
          <input className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: lançada em duplicidade" />
        </Field>

        <p className="text-xs text-ink/45">
          A retirada não é apagada: ela fica registrada como cancelada, com a data e o motivo, e
          deixa de contar no caixa e na sugestão de retirada. Dá para reativar depois.
        </p>

        {erro && <div className="bg-alerta/10 text-alerta text-sm rounded-md p-3">{erro}</div>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button onClick={confirmar} disabled={salvando}>{salvando ? 'Cancelando…' : 'Confirmar cancelamento'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function Despesas() {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ data: hoje(), categoria: '', descricao: '', valor: '', forma_pagamento: '' })

  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => supabase.from('despesas').select('*').order('data', { ascending: false })
    .then(({ data, error }) => {
      setErro(error ? error.message : null)
      setRows(data || [])
      setLoading(false)
    })
  useEffect(() => { load() }, [])

  const salvar = async () => {
    if (!f.valor) return alert('Informe o valor.')
    const { error } = await supabase.from('despesas').insert({ ...f, valor: Number(f.valor) })
    if (error) return alert(error.message)
    setOpen(false); setF({ data: hoje(), categoria: '', descricao: '', valor: '', forma_pagamento: '' }); load()
  }

  return (
    <Card title="Despesas operacionais" right={<Button onClick={() => setOpen(true)}>Nova despesa</Button>}>
      <ErroCarga msg={erro} />
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? (
        <Empty>Nenhuma despesa registrada.</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink/45 text-xs border-b border-borda">
            <th className="py-2 pr-3">Data</th><th className="py-2 px-3">Categoria</th>
            <th className="py-2 px-3">Descrição</th><th className="py-2 px-3 text-right">Valor</th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b border-borda/50">
              <td className="py-2 pr-3 text-ink/60">{dataBR(r.data)}</td>
              <td className="py-2 px-3">{r.categoria || '—'}</td>
              <td className="py-2 px-3 text-ink/60">{r.descricao || '—'}</td>
              <td className="py-2 px-3 text-right tnum">{brl(r.valor)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nova despesa">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><input type="date" className={inputCls} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Field>
            <Field label="Categoria"><input className={inputCls} placeholder="aluguel, frete…" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} /></Field>
          </div>
          <Field label="Descrição"><input className={inputCls} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor"><input type="number" step="0.01" className={inputCls} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Field>
            <Field label="Forma de pagamento"><input className={inputCls} value={f.forma_pagamento} onChange={(e) => setF({ ...f, forma_pagamento: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar}>Salvar</Button></div>
        </div>
      </Modal>
    </Card>
  )
}
