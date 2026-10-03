import { Suspense, useCallback, useEffect, useState } from 'react'
import { projects } from './registry'

/** Read the project id from the URL hash, e.g. "#/flocking" */
function idFromHash(): string {
  const id = window.location.hash.replace(/^#\/?/, '')
  return projects.some(p => p.id === id) ? id : projects[0].id
}

export default function App() {
  const [activeId, setActiveId] = useState(idFromHash)
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 700)

  const select = useCallback((id: string) => {
    window.location.hash = `/${id}`
  }, [])

  // keep state in sync with the URL (back/forward, pasted links)
  useEffect(() => {
    const onHash = () => setActiveId(idFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // up/down (or j/k) to step through projects
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const next = e.key === 'ArrowDown' || e.key === 'j' ? 1 : e.key === 'ArrowUp' || e.key === 'k' ? -1 : 0
      if (!next) return
      e.preventDefault()
      const i = projects.findIndex(p => p.id === activeId)
      select(projects[(i + next + projects.length) % projects.length].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, select])

  const active = projects.find(p => p.id === activeId)!
  const Active = active.component

  useEffect(() => {
    document.title = `${active.label} · Motion Lab`
  }, [active])

  return (
    <div className="shell" data-collapsed={collapsed}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="wordmark">MOTION LAB</span>
          <button
            className="icon-btn"
            onClick={() => setCollapsed(v => !v)}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand nav' : 'Collapse nav'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d={collapsed ? 'M6 3L10 8L6 13' : 'M10 3L6 8L10 13'}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="count">{projects.length} experiments</div>

        <nav className="nav" aria-label="Experiments">
          {projects.map((p, i) => (
            <button
              key={p.id}
              className="nav-item"
              aria-current={p.id === activeId}
              onClick={() => select(p.id)}
              title={p.label}
            >
              <span className="nav-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="nav-text">
                <div className="nav-label">{p.label}</div>
                <div className="nav-tag">{p.tag}</div>
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">↑ ↓ to browse</div>
      </aside>

      <main className="stage">
        <div className="caption">
          <div className="caption-meta">
            {active.tag.toUpperCase()}
            {active.added ? `  ${active.added}` : ''}
          </div>
          <div className="caption-title">{active.label}</div>
          <div className="caption-desc">{active.description}</div>
        </div>

        {/* key forces a clean remount so each animation starts fresh */}
        <Suspense fallback={null}>
          <div className="stage-canvas" key={active.id}>
            <Active />
          </div>
        </Suspense>
      </main>
    </div>
  )
}
