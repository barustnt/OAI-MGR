import { useEffect, useRef, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'

function classifyLine(line) {
  const l = line.toLowerCase()
  if (l.includes('error') || l.includes('assert') || l.includes('abort')) return 'log-error'
  if (l.includes('warn') || l.includes('timeout')) return 'log-warn'
  if (l.includes('[watchdog]')) return 'log-watch'
  if (l.includes('info') || l.includes('start')) return 'log-info'
  return ''
}

export default function LogViewer({ wsPath, title, height = '320px' }) {
  const [lines, setLines] = useState([])
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('')
  const bottomRef = useRef(null)

  const { connected } = useWebSocket(wsPath, (data) => {
    setLines(prev => { const next = [...prev, data]; return next.length > 1000 ? next.slice(-1000) : next })
  })

  useEffect(() => { if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines, autoScroll])

  const filtered = filter ? lines.filter(l => l.toLowerCase().includes(filter.toLowerCase())) : lines

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: '#fafafa',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={`dot ${connected ? 'dot-green' : 'dot-red'}`} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#475569', fontWeight: '500' }}>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 9px', color: '#0f172a', width: '130px', outline: 'none' }}
            placeholder="filter…" value={filter} onChange={e => setFilter(e.target.value)} />
          <button onClick={() => setAutoScroll(a => !a)}
            style={{
              fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: '600',
              padding: '4px 10px', borderRadius: '6px', border: '1px solid', cursor: 'pointer',
              background: autoScroll ? '#f0fdf4' : '#f8fafc',
              borderColor: autoScroll ? '#86efac' : '#e2e8f0',
              color: autoScroll ? '#15803d' : '#94a3b8',
            }}>Auto</button>
          <button onClick={() => setLines([])}
            style={{
              fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: '600',
              padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0',
              background: '#ffffff', color: '#94a3b8', cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#fca5a5'; e.currentTarget.style.color = '#b91c1c' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#94a3b8' }}
          >Clear</button>
        </div>
      </div>

      {/* Log body */}
      <div style={{ overflowY: 'auto', padding: '10px 14px', height, background: '#fafafa' }}>
        {filtered.length === 0 && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic' }}>No logs yet…</div>}
        {filtered.map((line, i) => <div key={i} className={`log-line ${classifyLine(line)}`}>{line}</div>)}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
