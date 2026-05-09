import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { useWebSocket } from '../hooks/useWebSocket'

const CONTAINERS = ['mysql','ims','oai-ext-dn','oai-nrf','oai-udr','oai-udm','oai-ausf','oai-amf','oai-smf','oai-upf']

export default function DashboardPage({ onNavigate }) {
  const [core, setCore] = useState([])
  const [gnb, setGnb] = useState({ status: 'not_running', mode: 'hw' })
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState('')

  const fetchAll = () => {
    api.get('/core/status').then(d => setCore(d.containers || []))
    api.get('/gnb/status').then(setGnb)
  }
  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 5000); return () => clearInterval(t) }, [])
  useWebSocket('/metrics/stream', d => { try { setMetrics(JSON.parse(d)) } catch {} })

  const running = core.filter(c => c.status === 'running').length
  const gnbRunning = gnb.status === 'running'

  const act = async (a) => {
    setLoading(a)
    if (a === 'sc') await api.post('/core/start')
    if (a === 'xc') await api.post('/core/stop')
    if (a === 'sg') await api.post('/gnb/start', { mode: 'hw', scope: false })
    if (a === 'xg') await api.post('/gnb/stop')
    setTimeout(fetchAll, 2000)
    setLoading('')
  }

  const kpis = [
    { label: 'Core Containers', value: `${running} / ${CONTAINERS.length}`, color: running === CONTAINERS.length ? '#15803d' : running > 0 ? '#b45309' : '#b91c1c', bg: running === CONTAINERS.length ? '#f0fdf4' : running > 0 ? '#fffbeb' : '#fff1f2', page: 'core' },
    { label: 'gNB Status',      value: gnb.status?.toUpperCase(),           color: gnbRunning ? '#15803d' : '#b91c1c', bg: gnbRunning ? '#f0fdf4' : '#fff1f2', page: 'gnb' },
    { label: 'Connected UEs',   value: metrics?.ue_count ?? '0',            color: '#1d4ed8', bg: '#eff6ff', page: 'metrics' },
    { label: 'TX Total',        value: metrics?.throughput ? `${(metrics.throughput.total_tx/1e6).toFixed(1)} MB` : '0 MB', color: '#15803d', bg: '#f0fdf4', page: 'metrics' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

      {/* Title */}
      <div>
        <div className="page-title">System Overview</div>
        <div className="page-subtitle">OpenAirInterface 5G SA — Network Operations Center</div>
        <div className="divider" style={{ marginTop: '12px' }} />
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {kpis.map(({ label, value, color, bg, page }) => (
          <div key={label} className="card card-hover" onClick={() => onNavigate(page)}
            style={{ padding: '18px 20px' }}>
            <div className="data-label" style={{ marginBottom: '10px' }}>{label}</div>
            <div className="data-value" style={{ fontSize: '24px', color }}>{value}</div>
            <div style={{ marginTop: '8px', height: '3px', borderRadius: '2px', background: bg }} />
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '14px' }}>Quick Actions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {[
            { id: 'sc', label: '▶ Start Core', cls: 'btn btn-success' },
            { id: 'xc', label: '■ Stop Core',  cls: 'btn btn-danger' },
            { id: 'sg', label: '▶ Start gNB',  cls: 'btn btn-primary' },
            { id: 'xg', label: '■ Stop gNB',   cls: 'btn btn-warning' },
          ].map(({ id, label, cls }) => (
            <button key={id} onClick={() => act(id)} disabled={!!loading} className={cls}>
              {loading === id ? 'Loading…' : label}
            </button>
          ))}
        </div>
      </div>

      {/* Container grid */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '14px' }}>
          Container Status
          <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: '500', color: '#64748b' }}>{running}/{CONTAINERS.length} running</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
          {CONTAINERS.map(name => {
            const c = core.find(x => x.name === name) || { status: 'unknown' }
            const isUp = c.status === 'running'
            return (
              <div key={name} style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${isUp ? '#bbf7d0' : '#fecaca'}`,
                background: isUp ? '#f0fdf4' : '#fff1f2',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span className={`dot ${isUp ? 'dot-green' : 'dot-red'}`} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: isUp ? '#15803d' : '#b91c1c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name.replace('oai-', '')}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
