import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import LogViewer from '../components/LogViewer'

const CONTAINERS = ['mysql','ims','oai-ext-dn','oai-nrf','oai-udr','oai-udm','oai-ausf','oai-amf','oai-smf','oai-upf']

export default function CorePage() {
  const [status, setStatus]       = useState([])
  const [loading, setLoading]     = useState('')
  const [selected, setSelected]   = useState('oai-amf')
  const [ricStatus, setRicStatus] = useState({ status: 'not_running', pid: null })
  const [ricLoading, setRicLoading] = useState('')
  const [showRicLogs, setShowRicLogs] = useState(false)

  const fetchCore = () => api.get('/core/status').then(d => setStatus(d.containers || []))
  const fetchRic  = () => api.get('/ric/status').then(d => setRicStatus(d)).catch(() => {})

  useEffect(() => {
    fetchCore(); fetchRic()
    const t1 = setInterval(fetchCore, 4000)
    const t2 = setInterval(fetchRic,  3000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [])

  const act = async (a) => {
    setLoading(a)
    await api.post(`/core/${a}`)
    setTimeout(fetchCore, 2000)
    setLoading('')
  }

  const ricAct = async (a) => {
    setRicLoading(a)
    await api.post(`/ric/${a}`)
    setTimeout(fetchRic, 1500)
    setRicLoading('')
  }

  const running    = status.filter(c => c.status === 'running').length
  const ricRunning = ricStatus.status === 'running'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

      {/* ── 5G Core Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">5G Core Network</div>
          <div className="page-subtitle">OAI CN5G — Docker Compose Stack — {running}/{CONTAINERS.length} online</div>
          <div className="divider" style={{ marginTop: '12px' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button className="btn btn-success"  onClick={() => act('start')}   disabled={!!loading}>{loading==='start'   ? 'Loading…' : '▶ Start'}</button>
          <button className="btn btn-warning"  onClick={() => act('restart')} disabled={!!loading}>{loading==='restart' ? 'Loading…' : '↺ Restart'}</button>
          <button className="btn btn-danger"   onClick={() => act('stop')}    disabled={!!loading}>{loading==='stop'    ? 'Loading…' : '■ Stop'}</button>
        </div>
      </div>

      {/* ── Container grid ── */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '14px' }}>Containers</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
          {CONTAINERS.map(name => {
            const c   = status.find(s => s.name === name) || { status: 'unknown' }
            const up  = c.status === 'running'
            const sel = selected === name
            return (
              <div key={name} onClick={() => { setSelected(name); setShowRicLogs(false) }}
                style={{
                  padding: '12px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
                  border: sel ? '2px solid #3b82f6' : `1px solid ${up ? '#bbf7d0' : '#fecaca'}`,
                  background: sel ? '#eff6ff' : up ? '#f0fdf4' : '#fff1f2',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '7px' }}>
                  <span className={`dot ${up ? 'dot-green' : 'dot-red'}`} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: sel ? '#1d4ed8' : up ? '#15803d' : '#b91c1c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </span>
                </div>
                <span className={`badge ${up ? 'badge-running' : 'badge-stopped'}`} style={{ fontSize: '10px' }}>{c.status}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── FlexRIC Near-RT RIC Card ── */}
      <div className="card" style={{ padding: '18px 20px', border: ricRunning ? '1px solid #a5f3fc' : '1px solid #e2e8f0', background: ricRunning ? '#f0fdff' : '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>

          {/* Left — title + status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}> </span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Near-RT RIC — FlexRIC</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <span className={`dot ${ricRunning ? 'dot-green' : 'dot-red'}`} />
                <span style={{ fontSize: '12px', color: ricRunning ? '#15803d' : '#64748b' }}>
                  {ricRunning ? `Running — PID ${ricStatus.pid}` : 'Not running'}
                </span>
              </div>
            </div>
          </div>

          {/* Right — buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setShowRicLogs(v => !v)}
              style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: showRicLogs ? '#f1f5f9' : '#fff', cursor: 'pointer', color: '#64748b' }}>
              {showRicLogs ? 'Hide Logs' : 'Show Logs'}
            </button>
            {!ricRunning ? (
              <button className="btn btn-success" onClick={() => ricAct('start')} disabled={!!ricLoading} style={{ fontSize: '12px', padding: '5px 14px' }}>
                {ricLoading === 'start' ? 'Starting…' : '▶ Start RIC'}
              </button>
            ) : (
              <>
                <button className="btn btn-warning" onClick={() => ricAct('restart')} disabled={!!ricLoading} style={{ fontSize: '12px', padding: '5px 14px' }}>
                  {ricLoading === 'restart' ? 'Restarting…' : '↺ Restart'}
                </button>
                <button className="btn btn-danger" onClick={() => ricAct('stop')} disabled={!!ricLoading} style={{ fontSize: '12px', padding: '5px 14px' }}>
                  {ricLoading === 'stop' ? 'Stopping…' : '■ Stop'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* RIC log viewer — shown when toggled */}
        {showRicLogs && (
          <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
            <LogViewer wsPath="/ric/logs/stream" title="nearRT-RIC logs" height="280px" />
          </div>
        )}
      </div>

      {/* ── Container log viewer ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Logs</span>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {CONTAINERS.map(name => (
              <button key={name} onClick={() => { setSelected(name); setShowRicLogs(false) }}
                style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
                  padding: '3px 9px', borderRadius: '6px', border: '1px solid', cursor: 'pointer', transition: 'all 0.1s',
                  background: selected === name && !showRicLogs ? '#3b82f6' : '#f8fafc',
                  borderColor: selected === name && !showRicLogs ? '#3b82f6' : '#e2e8f0',
                  color: selected === name && !showRicLogs ? '#fff' : '#64748b',
                  fontWeight: selected === name && !showRicLogs ? '600' : '400',
                }}>{name.replace('oai-','')}</button>
            ))}
          </div>
        </div>
        {!showRicLogs && (
          <LogViewer wsPath={`/core/logs/${selected}`} title={`docker logs -f ${selected}`} height="400px" />
        )}
      </div>

    </div>
  )
}
