export function PageHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-ink/55 mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function Page({ children }) {
  return <div className="p-8 max-w-[1200px] mx-auto">{children}</div>
}

export function Kpi({ label, value, hint, tone = 'default', big = false }) {
  const toneColor =
    tone === 'positivo' ? 'text-esmeralda'
    : tone === 'negativo' ? 'text-alerta'
    : 'text-ink'
  return (
    <div className="bg-white rounded-lg border border-borda p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink/45">{label}</div>
      <div className={`font-display font-bold tnum mt-1.5 ${big ? 'text-2xl' : 'text-xl'} ${toneColor}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink/45 mt-1">{hint}</div>}
    </div>
  )
}

export function Card({ title, right, children, className = '' }) {
  return (
    <div className={`bg-white rounded-lg border border-borda ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-borda">
          <h2 className="font-display font-semibold text-sm text-ink">{title}</h2>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

export function Badge({ children, tone = 'neutro' }) {
  const map = {
    neutro: 'bg-ink/5 text-ink/70',
    verde: 'bg-esmeralda/10 text-esmeralda',
    vermelho: 'bg-alerta/10 text-alerta',
    amarelo: 'bg-sand/20 text-[#8a6b1c]',
    azul: 'bg-blue-50 text-blue-700',
  }
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded ${map[tone]}`}>
      {children}
    </span>
  )
}

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled }) {
  const styles = {
    primary: 'bg-ink text-white hover:bg-panel',
    sand: 'bg-sand text-ink hover:brightness-95',
    ghost: 'bg-transparent text-ink/70 hover:bg-ink/5 border border-borda',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`text-sm font-medium px-3.5 py-2 rounded-md transition-colors disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  )
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-ink/60 mb-1">{label}</span>
      {children}
    </label>
  )
}

export const inputCls =
  'w-full border border-borda rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:border-ink/40'

export function Empty({ children }) {
  return <div className="text-sm text-ink/45 py-10 text-center">{children}</div>
}
