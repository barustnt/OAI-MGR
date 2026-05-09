import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import LogViewer from '../components/LogViewer'

const DEF = { imsi: '001010000000001', rb: '106', numerology: '1', band: '78', carrier_freq: '3619200000', rfsimulator_addr: '127.0.0.1' }

export default function UEPage() {
  const [ues, setUes] = useState([])
  const [form, setForm] = useState(DEF)
  const [scope, setScope] = useState(false)
  const [sel, setSel] = useState(null)
  const [loading, setLoading] = useState('')

  const fetch = () => api.get('/ue/status').then(d => setUes(d.ues || []))
  useEffect(() => { fetch(); const t = setInterval(fetch, 3000); return () => clearInterval(t) }, [])

  const start = async () => { setLoading('start'); await api.post('/ue/start', { ...form, scope }); setSel(form.imsi); setTimeout(fetch, 1000); setLoading('') }
  const stop = async (imsi) => { setLoading(`s-${imsi}`); await api.post('/ue/stop', { imsi }); setTimeout(fetch, 1000); setLoading('') }
  const stopAll = async () => { setLoading('all'); await api.post('/ue/stop_all'); setTimeout(fetch, 1000); setLoading('') }

  const cmd = `sudo ./nr-uesoftmodem -r ${form.rb} --numerology ${form.numerology} --band ${form.band} -C ${form.carrier_freq} --uicc0.imsi ${form.imsi} --rfsim --rfsimulator.serveraddr ${form.rfsimulator_addr}${scope ? ' -d' : ''}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">UE Control — RFSIM</div>
          <div className="page-subtitle">nr-uesoftmodem — Software UE Simulation</div>
          <div className="divider" style={{ marginTop: '12px' }} />
        </div>
        <div style={{ marginTop: '6px', fontSize: '13px', fontWeight: '600', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '8px', padding: '5px 12px' }}>
          {ues.length} Active
        </div>
      </div>

      {/* Form */}
      <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>New UE Instance</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {Object.entries(form).map(([k, v]) => (
            <div key={k}>
              <div className="data-label" style={{ marginBottom: '5px' }}>{k}</div>
              <input className="form-input" value={v} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
        </div>

        {/* Scope */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
          <div className="data-label" style={{ width: '60px' }}>Scope</div>
          <div onClick={() => setScope(s => !s)} className="toggle"
            style={{ borderColor: scope ? '#86efac' : '#e2e8f0', background: scope ? '#f0fdf4' : '#f8fafc', cursor: 'pointer' }}>
            <div className="toggle-thumb" style={{ background: scope ? '#22c55e' : '#cbd5e1', left: scope ? '22px' : '3px' }} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: '500', color: scope ? '#15803d' : '#94a3b8' }}>
            {scope ? 'Softscope enabled (-d)' : 'Softscope disabled'}
          </span>
        </div>

        {/* Command preview */}
        <div>
          <div className="data-label" style={{ marginBottom: '6px' }}>Command</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '10px 12px', wordBreak: 'break-all' }}>{cmd}</div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-success" onClick={start} disabled={!!loading}>{loading==='start' ? 'Loading…' : '▶ Start UE'}</button>
          {ues.length > 0 && <button className="btn btn-danger" onClick={stopAll} disabled={!!loading}>{loading==='all' ? 'Loading…' : '■ Stop All'}</button>}
        </div>
      </div>

      {/* Active UEs */}
      {ues.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>Active UEs</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ues.map(ue => (
              <div key={ue.imsi} onClick={() => setSel(ue.imsi)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 18px', cursor: 'pointer', transition: 'background 0.15s',
                  borderBottom: '1px solid #f8fafc',
                  background: sel === ue.imsi ? '#eff6ff' : '#ffffff',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className={`dot ${ue.status === 'running' ? 'dot-green' : 'dot-red'}`} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#0f172a', fontWeight: '500' }}>IMSI: {ue.imsi}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#94a3b8' }}>PID: {ue.pid}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`badge ${ue.status === 'running' ? 'badge-running' : 'badge-stopped'}`}>{ue.status}</span>
                  <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '11px' }}
                    onClick={e => { e.stopPropagation(); stop(ue.imsi) }}
                    disabled={!!loading}>{loading===`s-${ue.imsi}` ? '…' : '■ Stop'}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sel && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <LogViewer wsPath={`/ue/logs/stream/${sel}`} title={`nr-uesoftmodem — ${sel}`} height="380px" />
        </div>
      )}
    </div>
  )
}
