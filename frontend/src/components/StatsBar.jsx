export function StatsBar({ servers }) {
  const total       = servers.length
  const available   = servers.filter(s => s.status_label === 'available').length
  const booked      = servers.filter(s => s.status_label === 'booked').length
  const unreachable = servers.filter(s => s.status_label === 'unreachable').length
  const unknown     = servers.filter(s => s.status_label === 'unknown').length

  return (
    <div className="stats-bar">
      <div className="stat-item s-total">
        <span className="stat-value">{total}</span>
        <span className="stat-label">Total</span>
      </div>
      <div className="stat-item s-available">
        <span className="stat-value">{available}</span>
        <span className="stat-label">Available</span>
      </div>
      <div className="stat-item s-booked">
        <span className="stat-value">{booked}</span>
        <span className="stat-label">Booked</span>
      </div>
      <div className="stat-item s-unreachable">
        <span className="stat-value">{unreachable}</span>
        <span className="stat-label">Unreachable</span>
      </div>
      <div className="stat-item s-unknown">
        <span className="stat-value">{unknown}</span>
        <span className="stat-label">Unknown</span>
      </div>
    </div>
  )
}
