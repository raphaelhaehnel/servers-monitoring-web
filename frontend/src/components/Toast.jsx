import { CheckCircle, XCircle, Info } from 'lucide-react'

const ICONS = {
  success: <CheckCircle size={15} color="var(--available)" />,
  error:   <XCircle    size={15} color="var(--unreachable)" />,
  info:    <Info       size={15} color="var(--accent)" />,
}

export function ToastStack({ toasts }) {
  if (!toasts.length) return null
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast t-${t.type}`}>
          {ICONS[t.type]}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
