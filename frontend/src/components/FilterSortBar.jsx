import { ArrowUp, ArrowDown } from 'lucide-react'

const STATUS_CHIPS = [
  { key: 'all',         label: 'All',         activeClass: 'active-all' },
  { key: 'available',   label: 'Available',   activeClass: 'active-available' },
  { key: 'booked',      label: 'Booked',      activeClass: 'active-booked' },
  { key: 'unreachable', label: 'Unreachable', activeClass: 'active-unreachable' },
  { key: 'unknown',     label: 'Unknown',     activeClass: 'active-unknown' },
]

const SORT_OPTIONS = [
  { key: 'dns',       label: 'Name' },
  { key: 'env',       label: 'Environment' },
  { key: 'status',    label: 'Status' },
  { key: 'booked_by', label: 'Booked by' },
  { key: 'duration',  label: 'Duration' },
  { key: 'updated',   label: 'Last updated' },
]

export function FilterSortBar({
  filters, onFilterChange,
  sort, onSortChange,
  environments,
  componentTypes,   // string[] — auto-built from server data
}) {
  const { text, status, env, appSearch, bookedOnly, reachableOnly, componentType } = filters
  const { key: sortKey, dir } = sort

  function toggleSort(key) {
    onSortChange({ key, dir: sortKey === key && dir === 'asc' ? 'desc' : 'asc' })
  }

  const hasActiveFilter =
    text || env || appSearch || bookedOnly || reachableOnly ||
    status !== 'all' || componentType

  function clearAll() {
    onFilterChange({
      text: '', status: 'all', env: '', appSearch: '',
      bookedOnly: false, reachableOnly: false, componentType: '',
    })
  }

  return (
    <div className="filter-section">

      {/* Row 1: search inputs + quick toggles */}
      <div className="filter-row">
        <span className="filter-row-label">Filter</span>

        <input
          className="inp inp-wide"
          placeholder="Search hostname…"
          value={text}
          onChange={e => onFilterChange({ ...filters, text: e.target.value })}
        />

        <select
          className="sel"
          value={env}
          onChange={e => onFilterChange({ ...filters, env: e.target.value })}
        >
          <option value="">All envs</option>
          {environments.map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>

        {/* Component type — only rendered when at least one type is known */}
        {componentTypes.length > 0 && (
          <select
            className="sel"
            value={componentType}
            onChange={e => onFilterChange({ ...filters, componentType: e.target.value })}
          >
            <option value="">All types</option>
            {componentTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        <input
          className="inp inp-sm"
          placeholder="App name…"
          value={appSearch}
          onChange={e => onFilterChange({ ...filters, appSearch: e.target.value })}
          title="Filter by installed application name (partial match)"
        />

        <button
          className={`chip ${bookedOnly ? 'active-booked' : ''}`}
          onClick={() => onFilterChange({ ...filters, bookedOnly: !bookedOnly })}
        >
          Booked only
        </button>

        <button
          className={`chip ${reachableOnly ? 'active-available' : ''}`}
          onClick={() => onFilterChange({ ...filters, reachableOnly: !reachableOnly })}
        >
          Reachable only
        </button>

        {hasActiveFilter && (
          <button
            className="chip"
            onClick={clearAll}
            style={{ color: 'var(--unreachable)', borderColor: 'rgba(239,68,68,0.25)' }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="filter-divider" />

      {/* Row 2: status chips */}
      <div className="filter-row">
        <span className="filter-row-label">Status</span>
        {STATUS_CHIPS.map(chip => (
          <button
            key={chip.key}
            className={`chip ${status === chip.key ? chip.activeClass : ''}`}
            onClick={() => onFilterChange({ ...filters, status: chip.key })}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="filter-divider" />

      {/* Row 3: sort chips */}
      <div className="filter-row">
        <span className="filter-row-label">Sort</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            className={`sort-chip ${sortKey === opt.key ? 'active' : ''}`}
            onClick={() => toggleSort(opt.key)}
          >
            {opt.label}
            {sortKey === opt.key && (dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
          </button>
        ))}
      </div>

    </div>
  )
}
