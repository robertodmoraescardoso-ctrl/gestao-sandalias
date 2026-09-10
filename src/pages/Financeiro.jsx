import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { brl, dataBR, hoje } from '../lib/format'
import { Page, PageHeader, Card, Button, Badge, Kpi, Field, inputCls, Empty } from '../components/ui'
import Modal from '../components/Modal.jsx'

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

  const load = () => supabase.from('v_contas_pagar').select('*')
    .order('data_vencimento').then(({ data }) => setRows(data || []))
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
        {visiveis.length === 0 ? <Empty>Nenhuma conta. Elas aparecem aqui automaticamente ao registrar recebimentos.</Empty> : (
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

function Retiradas() {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ data: hoje(), socio: '', valor: '', descricao: '', forma_pagamento: '', observacao: '' })

  const load = () => supabase.from('retiradas_socios').select('*').order('data', { ascending: false })
    .then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [])

  const salvar = async () => {
    if (!f.socio || !f.valor) return alert('Informe sócio e valor.')
    const { error } = await supabase.from('retiradas_socios').insert({ ...f, valor: Number(f.valor) })
    if (error) return alert(error.message)
    setOpen(false); setF({ data: hoje(), socio: '', valor: '', descricao: '', forma_pagamento: '', observacao: '' }); load()
  }
  const total = rows.reduce((s, r) => s + Number(r.valor), 0)

  return (
    <>
      <div className="bg-white border border-borda rounded-md p-3 mb-6 text-sm text-ink/60">
        Retiradas ficam <b>fora</b> do cálculo de lucro e despesas — elas reduzem apenas o caixa disponível.
        Total retirado: <b className="tnum text-ink">{brl(total)}</b>
      </div>
      <Card title="Retiradas dos sócios" right={<Button onClick={() => setOpen(true)}>Nova retirada</Button>}>
        {rows.length === 0 ? <Empty>Nenhuma retirada registrada.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ink/45 text-xs border-b border-borda">
              <th className="py-2 pr-3">Data</th><th className="py-2 px-3">Sócio</th>
              <th className="py-2 px-3">Motivo</th><th className="py-2 px-3">Forma</th><th className="py-2 px-3 text-right">Valor</th>
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-b border-borda/50">
                <td className="py-2 pr-3 text-ink/60">{dataBR(r.data)}</td>
                <td className="py-2 px-3 font-medium">{r.socio}</td>
                <td className="py-2 px-3 text-ink/60">{r.descricao || '—'}</td>
                <td className="py-2 px-3 text-ink/60">{r.forma_pagamento || '—'}</td>
                <td className="py-2 px-3 text-right tnum">{brl(r.valor)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <Modal open={open} onClose={() => setOpen(false)} title="Nova retirada">
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
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={salvar}>Salvar</Button></div>
          </div>
        </Modal>
      </Card>
    </>
  )
}

function Despesas() {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ data: hoje(), categoria: '', descricao: '', valor: '', forma_pagamento: '' })

  const load = () => supabase.from('despesas').select('*').order('data', { ascending: false })
    .then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [])

  const salvar = async () => {
    if (!f.valor) return alert('Informe o valor.')
    const { error } = await supabase.from('despesas').insert({ ...f, valor: Number(f.valor) })
    if (error) return alert(error.message)
    setOpen(false); setF({ data: hoje(), categoria: '', descricao: '', valor: '', forma_pagamento: '' }); load()
  }

  return (
    <Card title="Despesas operacionais" right={<Button onClick={() => setOpen(true)}>Nova despesa</Button>}>
      {rows.length === 0 ? <Empty>Nenhuma despesa registrada.</Empty> : (
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
