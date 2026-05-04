import { useState } from 'react'
import { X, BookOpen, BookX, MessageSquare, Plus, Trash2, AlertTriangle } from 'lucide-react'

function ModalBase({ title, subtitle, onClose, children, footer }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="modal-dns">{subtitle}</div>}
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/* ── Add Server ─────────────────────────────────────────────────────────── */
export function AddServerModal({ onConfirm, onClose, loading }) {
  const [dns, setDns] = useState('')
  function submit() { if (dns.trim()) onConfirm(dns.trim()) }
  return (
    <ModalBase
      title="Add Server" onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!dns.trim() || loading}>
            <Plus size={12} /> Add
          </button>
        </>
      }
    >
      <div className="fg">
        <label className="flabel">DNS Hostname</label>
        <input
          className="finput" placeholder="system-env-name-number"
          value={dns} onChange={e => setDns(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} autoFocus
        />
        <span className="fhint">e.g. google-prod1-redis-1</span>
      </div>
    </ModalBase>
  )
}

/* ── Book Server ────────────────────────────────────────────────────────── */
// onConfirm(dns, version, user, comment, hours)
export function BookModal({ server, onConfirm, onClose, loading }) {
  const [user,    setUser]    = useState('')
  const [comment, setComment] = useState('')
  const [hours,   setHours]   = useState('')

  function submit() {
    if (!user.trim()) return
    onConfirm(server.dns, server.version, user.trim(), comment.trim(), hours ? parseFloat(hours) : undefined)
  }

  return (
    <ModalBase
      title={<><BookOpen size={15} style={{ marginRight: 7 }} />Book Server</>}
      subtitle={server.dns} onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!user.trim() || loading}>
            Confirm Booking
          </button>
        </>
      }
    >
      <div className="fg">
        <label className="flabel">Your Name *</label>
        <input className="finput" placeholder="e.g. alice" value={user}
          onChange={e => setUser(e.target.value)} autoFocus />
      </div>
      <div className="fg">
        <label className="flabel">Comment</label>
        <input className="finput" placeholder="What are you testing?" value={comment}
          onChange={e => setComment(e.target.value)} />
      </div>
      <div className="fg">
        <label className="flabel">Duration (hours)</label>
        <input className="finput" type="number" min="0.5" step="0.5"
          placeholder="Leave blank for indefinite" value={hours}
          onChange={e => setHours(e.target.value)} />
      </div>
    </ModalBase>
  )
}

/* ── Free Server ────────────────────────────────────────────────────────── */
// onConfirm(dns, version, comment)
export function FreeModal({ server, onConfirm, onClose, loading }) {
  const [comment, setComment] = useState('')
  return (
    <ModalBase
      title={<><BookX size={15} style={{ marginRight: 7 }} />Free Server</>}
      subtitle={server.dns} onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading}
            onClick={() => onConfirm(server.dns, server.version, comment || null)}>
            Free Server
          </button>
        </>
      }
    >
      {server.booked_by && (
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>
          Currently booked by <strong style={{ color: 'var(--booked)' }}>{server.booked_by}</strong>.
        </p>
      )}
      <div className="fg">
        <label className="flabel">New Comment <span style={{ color: 'var(--text3)' }}>(optional)</span></label>
        <input className="finput" placeholder="Leave blank to keep existing comment"
          value={comment} onChange={e => setComment(e.target.value)} autoFocus />
      </div>
    </ModalBase>
  )
}

/* ── Change Comment ─────────────────────────────────────────────────────── */
// onConfirm(dns, version, comment)
export function CommentModal({ server, onConfirm, onClose, loading }) {
  const [comment, setComment] = useState(server.comment ?? '')
  return (
    <ModalBase
      title={<><MessageSquare size={15} style={{ marginRight: 7 }} />Edit Comment</>}
      subtitle={server.dns} onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading}
            onClick={() => onConfirm(server.dns, server.version, comment)}>
            Save Comment
          </button>
        </>
      }
    >
      <div className="fg">
        <label className="flabel">Comment</label>
        <input className="finput" placeholder="Add a note…" value={comment}
          onChange={e => setComment(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onConfirm(server.dns, server.version, comment)}
          autoFocus />
      </div>
    </ModalBase>
  )
}

/* ── Delete Confirm ─────────────────────────────────────────────────────── */
// onConfirm(dns, version)
export function DeleteModal({ server, onConfirm, onClose, loading }) {
  return (
    <ModalBase
      title={<><Trash2 size={15} style={{ marginRight: 7, color: 'var(--unreachable)' }} />Remove Server</>}
      subtitle={server.dns} onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={loading}
            onClick={() => onConfirm(server.dns, server.version)}>
            Delete
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <AlertTriangle size={16} style={{ color: 'var(--unreachable)', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>
          Remove <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{server.dns}</strong> from the registry? This cannot be undone.
        </p>
      </div>
    </ModalBase>
  )
}
