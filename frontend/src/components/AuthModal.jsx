import { useState } from 'react'
import { Lock, Eye, EyeOff, LogIn, X } from 'lucide-react'

export function AuthModal({ onLogin, loading, error, onClearError, onClose }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)

  function submit(e) {
    e.preventDefault()
    if (!username.trim() || !password) return
    onLogin(username.trim(), password)
  }

  return (
    <div
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="modal-head">
          <div>
            <div className="modal-title">
              <Lock size={15} style={{ color: 'var(--accent)', marginRight: 8 }} />
              Sign in
            </div>
            <div className="modal-dns">Required to add, edit, or refresh servers</div>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="fg">
              <label className="flabel">Username</label>
              <input
                className="finput"
                value={username}
                onChange={e => { setUsername(e.target.value); onClearError() }}
                placeholder="username"
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="fg">
              <label className="flabel">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="finput"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); onClearError() }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  className="btn btn-icon btn-ghost"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute', right: 4, top: '50%',
                    transform: 'translateY(-50%)', width: 28, height: 28,
                  }}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: 'var(--unreachable-bg)',
                border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 6, padding: '8px 12px',
                fontSize: 13, color: 'var(--unreachable)',
              }}>
                {error}
              </div>
            )}
          </div>

          <div className="modal-foot" style={{ marginTop: 4 }}>
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !username.trim() || !password}
            >
              {loading
                ? <><span style={{ display: 'inline-block', animation: 'spin 0.7s linear infinite' }}>⟳</span> Signing in…</>
                : <><LogIn size={13} /> Sign in</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
