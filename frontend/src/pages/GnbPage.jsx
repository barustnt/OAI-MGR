import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import LogViewer from '../components/LogViewer'

export default function GnbPage() {
  const [status, setStatus] = useState({ status: 'not_running', mode: 'hw', scope: false })
  const [mode, setMode] = useState('hw')
  const [scope, setScope] = useState(false)
  const [watchdog, setWatchdog] = useState(false)
  const [loading, setLoading] = useState('')

  const fetchStatus = () => api.get('/gnb/status').then(setStatus)
  useEffect(() => { fetchStatus(); const t = setInterval(fetchStatus, 3000); return () => clearInterval(t) }, [])

  const act = async (a) => {
    setLoading(a)
    if (a === 'start')   await api.post('/gnb/start',   { mode, scope })
    if (a === 'stop')    await api.post('/gnb/stop')
    if (a === 'restart') await api.post('/gnb/restart', { mode, scope })
    if (a === 'wd') {
      if (watchdog) { await api.post('/gnb/watchdog/disable'); setWatchdog(false) }
      else          { await api.post('/gnb/watchdog/enable', { mode, scope }); setWatchdog(true) }
    }
    setTimeout(fetchStatus, 1000)
    setLoading('')
  }

  const isRunning = status.status === 'running'
  const cmd = (mode === 'rfsim'
    ? 'sudo ./nr-softmodem -O gnb.conf --gNBs.[0].min_rxtxtime 6 --rfsim --sa'
    : 'sudo ./nr-softmodem -O gnb.conf -E --continuous-tx') + (scope ? ' -d' : '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">gNB Control</div>
          <div className="page-subtitle">nr-softmodem — OpenAirInterface 5G NR Base Station</div>
          <div className="divider" style={{ marginTop: '12px' }} />
        </div>
        <span className={`badge ${isRunning ? 'badge-running' : 'badge-stopped'}`} style={{ marginTop: '6px' }}>
          {status.status?.replace('_',' ')}
        </span>
      </div>

      {/* Options */}
      <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>Configuration</div>

        {/* Mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="data-label" style={{ width: '60px' }}>Mode</div>
          <div style={{ display: 'flex' }}>
            {['hw', 'rfsim'].map(m => (
              <button key={m} onClick={() => !isRunning && setMode(m)}
                className={`mode-btn ${mode === m ? 'active' : ''}`}
                style={{ opacity: isRunning ? 0.5 : 1 }}>
                {m === 'hw' ? '◎ USRP B210' : '◈ RFSIM'}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
            {mode === 'hw' ? '// real hardware' : '// software sim'}
          </span>
        </div>

        {/* Scope */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="data-label" style={{ width: '60px' }}>Scope</div>
          <div onClick={() => !isRunning && setScope(s => !s)}
            className="toggle"
            style={{ borderColor: scope ? '#86efac' : '#e2e8f0', background: scope ? '#f0fdf4' : '#f8fafc', cursor: isRunning ? 'not-allowed' : 'pointer', opacity: isRunning ? 0.5 : 1 }}>
            <div className="toggle-thumb" style={{ background: scope ? '#22c55e' : '#cbd5e1', left: scope ? '22px' : '3px' }} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: '500', color: scope ? '#15803d' : '#94a3b8' }}>
            {scope ? 'Softscope enabled (-d)' : 'Softscope disabled'}
          </span>
          {scope && <span style={{ fontSize: '12px', color: '#b45309', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', padding: '2px 8px' }}>⚠ GUI on server</span>}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {[
          { label: 'Status', value: status.status?.toUpperCase(), color: isRunning ? '#15803d' : '#b91c1c' },
          { label: 'Mode',   value: (status.mode || mode)?.toUpperCase(), color: '#1d4ed8' },
          { label: 'Scope',  value: status.scope ? 'ON' : 'OFF', color: status.scope ? '#15803d' : '#94a3b8' },
          { label: 'PID',    value: status.pid || '—', color: '#b45309' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: '14px 16px' }}>
            <div className="data-label" style={{ marginBottom: '8px' }}>{label}</div>
            <div className="data-value" style={{ fontSize: '18px', color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button className="btn btn-success" onClick={() => act('start')} disabled={isRunning || !!loading}>{loading==='start' ? 'Loading…' : '▶ Start gNB'}</button>
        <button className="btn btn-danger"  onClick={() => act('stop')}  disabled={!isRunning || !!loading}>{loading==='stop'  ? 'Loading…' : '■ Stop gNB'}</button>
        <button className="btn btn-warning" onClick={() => act('restart')} disabled={!!loading}>{loading==='restart' ? 'Loading…' : '↺ Restart'}</button>
        <button className="btn btn-purple"  onClick={() => act('wd')} disabled={!!loading}>
          {loading==='wd' ? 'Loading…' : watchdog ? '◉ Watchdog On' : '◎ Watchdog Off'}
        </button>
      </div>

      {/* Command preview */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div className="data-label" style={{ marginBottom: '8px' }}>Command Preview</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px 12px', wordBreak: 'break-all' }}>{cmd}</div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <LogViewer wsPath="/gnb/logs/stream" title="nr-softmodem stdout" height="400px" />
      </div>
    </div>
  )
}
