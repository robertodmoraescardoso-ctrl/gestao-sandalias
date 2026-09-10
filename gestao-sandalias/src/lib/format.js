export const brl = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const num = (v) => (Number(v) || 0).toLocaleString('pt-BR')

export const dataBR = (d) => {
  if (!d) return '—'
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}

export const hoje = () => new Date().toISOString().slice(0, 10)

export function periodo(chave) {
  const fim = new Date()
  const ini = new Date()
  if (chave === '7d') ini.setDate(fim.getDate() - 6)
  else if (chave === '30d') ini.setDate(fim.getDate() - 29)
  else if (chave === 'mes') ini.setDate(1)
  else if (chave === 'ano') { ini.setMonth(0); ini.setDate(1) }
  const f = (d) => d.toISOString().slice(0, 10)
  return { inicio: f(ini), fim: f(fim) }
}
