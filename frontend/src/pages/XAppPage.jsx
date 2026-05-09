import { useState, useEffect, useCallback } from 'react'

export default function XAppPage() {
  const [status, setStatus]         = useState(null)
  const [loading, setLoading]       = useState(null)
  const [log, setLog]               = useState([])
  const [ueIp, setUeIp]             = useState(null)
  const [ueIpLoading, setUeIpLoading] = useState(false)

  const addLog = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false })
    setLog(l => [...l.slice(-49), { ts, msg, type }])
  }

  const fetchStatus = useCallback(async () => {
    try { const r = await fetch('/xapp/status'); setStatus(await r.json()) }
    catch { setStatus(null) }
  }, [])

  useEffect(() => {
    fetchStatus()
    const t = setInterval(fetchStatus, 5000)
    return () => clearInterval(t)
  }, [fetchStatus])

  const sendSlice = async (speed) => {
    setLoading(speed)
    addLog(`Sending slice: ${speed.toUpperCase()}...`)
    try {
      const r = await fetch('/xapp/slice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed }),
      })
      const d = await r.json()
      if (d.success) {
        addLog(`✅ ${d.label} — ${d.prb_pct}% PRBs [${d.mode}]`, 'success')
        fetchStatus()
        setTimeout(fetchStatus, 7000)
      } else {
        addLog(`❌ Failed: ${d.detail}`, 'error')
      }
    } catch (e) {
      addLog(`❌ xApp unreachable: ${e.message}`, 'error')
    }
    setLoading(null)
  }

  const discoverUeIp = async () => {
    setUeIpLoading(true)
    addLog('Discovering UE IP...')
    try {
      const r = await fetch('/api/ue/ip')
      const d = await r.json()
      if (d.ip) { setUeIp(d.ip); addLog(`✅ UE IP: ${d.ip}`, 'success') }
      else addLog('⚠️ UE not found — start UE first', 'warn')
    } catch { addLog('⚠️ Backend unreachable', 'warn') }
    setUeIpLoading(false)
  }

  const currentSlice = status?.current_slice
  const activeSpeed  = currentSlice?.speed
  const ricOnline    = status?.ric_running
  const logColors    = { info: '#64748b', success: '#22c55e', error: '#ef4444', warn: '#f59e0b' }

  const SLICES = [
    {
      speed: 'high', label: 'HIGH', prb: '80%',
      pos: 'pos 0–10', color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0',
      desc: 'Fast Network',
    },
    {
      speed: 'low',  label: 'LOW', prb: '25%',
      pos: 'pos 0–3', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA',
      desc: 'Slow Network',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

      {/* Header */}
      <div>
        <div className="page-title">xApp / Slice Control</div>
        <div className="page-subtitle">E2 near-RT RIC — FlexRIC SLICE_SM_V0 — STATIC algorithm</div>
        <div className="divider" style={{ marginTop: '12px' }} />
      </div>

      {/* Status bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'nearRT-RIC',
            value: ricOnline ? 'Online' : status === null ? 'Unknown' : 'Offline',
            ok: ricOnline },
          { label: 'xApp Binary',
            value: status?.custom_binary_available ? 'Ready' : 'Not Built',
            ok: status?.custom_binary_available },
          { label: 'Active Slice',
            value: activeSpeed
              ? `${activeSpeed.toUpperCase()} — ${currentSlice.prb_pct}% PRBs @ ${currentSlice.applied_at}`
              : 'None',
            ok: !!activeSpeed },
        ].map(({ label, value, ok }) => (
          <div key={label} className="card" style={{
            padding: '14px 18px',
            background: ok === undefined ? '#f8fafc' : ok ? '#f0fdf4' : '#fef2f2',
          }}>
            <div className="data-label" style={{ marginBottom: '6px' }}>{label}</div>
            <div style={{ fontSize: '13px', fontWeight: '700',
              fontFamily: "'JetBrains Mono', monospace",
              color: ok === undefined ? '#64748b' : ok ? '#15803d' : '#dc2626' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* PRB bar */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
            PRB Allocation (pos 0–13, 106-PRB config)
          </div>
          <div style={{ fontSize: '12px', fontWeight: '700',
            fontFamily: "'JetBrains Mono', monospace",
            color: activeSpeed === 'high' ? '#15803d' : activeSpeed === 'low' ? '#dc2626' : '#94a3b8' }}>
            {currentSlice?.prb_pct ? `${currentSlice.prb_pct}%` : '—'}
          </div>
        </div>
        <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${currentSlice?.prb_pct ?? 0}%`,
            background: activeSpeed === 'high'
              ? 'linear-gradient(90deg, #22c55e, #15803d)'
              : activeSpeed === 'low'
              ? 'linear-gradient(90deg, #f87171, #dc2626)'
              : '#e2e8f0',
            borderRadius: '5px',
            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ fontSize: '9px', color: '#cbd5e1', fontFamily: "'JetBrains Mono', monospace" }}>0%</span>
          <span style={{ fontSize: '9px', color: '#cbd5e1', fontFamily: "'JetBrains Mono', monospace" }}>100%</span>
        </div>
      </div>

      {/* Slice buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {SLICES.map(slice => {
          const isActive  = activeSpeed === slice.speed
          const isLoading = loading === slice.speed
          return (
            <div key={slice.speed} className="card" style={{
              padding: '24px',
              border: `2px solid ${isActive ? slice.border : '#e2e8f0'}`,
              background: isActive ? slice.bg : '#ffffff',
              transition: 'all 0.2s',
            }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>{slice.emoji}</div>
                <div style={{ fontSize: '22px', fontWeight: '800', color: slice.color,
                  fontFamily: "'JetBrains Mono', monospace" }}>
                  {slice.label}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  {slice.desc}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between',
                marginBottom: '8px', padding: '8px 12px',
                background: '#f8fafc', borderRadius: '8px',
                border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', color: '#64748b',
                  fontFamily: "'JetBrains Mono', monospace" }}>{slice.pos}</span>
                <span style={{ fontSize: '11px', fontWeight: '700', color: slice.color,
                  fontFamily: "'JetBrains Mono', monospace" }}>{slice.prb} PRBs</span>
              </div>

              <button onClick={() => sendSlice(slice.speed)}
                disabled={isLoading || isActive}
                style={{
                  width: '100%', padding: '12px',
                  borderRadius: '10px', border: `2px solid ${isActive ? slice.color : '#e2e8f0'}`,
                  background: isActive ? slice.bg : isLoading ? '#f8fafc' : slice.color,
                  color: isActive ? slice.color : isLoading ? '#94a3b8' : '#ffffff',
                  fontSize: '14px', fontWeight: '700',
                  cursor: isLoading || isActive ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: loading && loading !== slice.speed ? 0.5 : 1,
                }}>
                {isLoading ? '⏳ Applying...' : isActive ? `● ${slice.label} Active` : `Apply ${slice.label}`}
              </button>

              {isActive && (
                <div style={{ textAlign: 'center', marginTop: '8px',
                  fontSize: '10px', color: slice.color,
                  fontFamily: "'JetBrains Mono', monospace" }}>
                  applied at {currentSlice.applied_at}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* UE IP + iperf */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '12px' }}>
             UE Connectivity
          </div>
          {ueIp ? (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '20px',
              fontWeight: '700', color: '#15803d', background: '#f0fdf4',
              border: '1px solid #bbf7d0', borderRadius: '8px',
              padding: '10px 14px', marginBottom: '10px' }}>{ueIp}</div>
          ) : (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px',
              color: '#94a3b8', background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: '8px', padding: '10px 14px', marginBottom: '10px' }}>
              Not discovered
            </div>
          )}
          <button onClick={discoverUeIp} disabled={ueIpLoading}
            style={{ width: '100%', padding: '9px', borderRadius: '8px', border: 'none',
              background: ueIpLoading ? '#e2e8f0' : '#0f172a',
              color: ueIpLoading ? '#94a3b8' : '#fff',
              fontSize: '12px', fontWeight: '600',
              cursor: ueIpLoading ? 'not-allowed' : 'pointer' }}>
            {ueIpLoading ? 'Discovering...' : '🔍 Discover UE IP'}
          </button>
        </div>

        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '12px' }}>
             iperf3 Test
          </div>
          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '14px', marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', color: '#475569', fontWeight: '600',
              marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Step 1 — Server
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px',
              color: '#e2e8f0', marginBottom: '10px' }}>
              docker exec oai-ext-dn iperf3 -s
            </div>
            <div style={{ fontSize: '10px', color: '#475569', fontWeight: '600',
              marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Step 2 — Client
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px',
              color: '#e2e8f0', lineHeight: '1.8' }}>
              iperf3 -c 192.168.70.135 \<br/>
              &nbsp;&nbsp;-B <span style={{ color: ueIp ? '#22c55e' : '#f97316' }}>
                {ueIp || '<UE_IP>'}
              </span> \<br/>
              &nbsp;&nbsp;-u -b 20M -t 3600 --parallel 4
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => navigator.clipboard?.writeText('docker exec oai-ext-dn iperf3 -s')}
              style={{ flex: 1, padding: '7px', borderRadius: '6px',
                border: '1px solid #e2e8f0', background: '#f8fafc',
                color: '#374151', fontSize: '11px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace" }}>
              📋 Server
            </button>
            <button onClick={() => navigator.clipboard?.writeText(
              `iperf3 -c 192.168.70.135 -B ${ueIp||'<UE_IP>'} -u -b 20M -t 3600 --parallel 4`)}
              style={{ flex: 1, padding: '7px', borderRadius: '6px',
                border: '1px solid #e2e8f0', background: '#f8fafc',
                color: '#374151', fontSize: '11px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace" }}>
              📋 Client {ueIp ? `(${ueIp})` : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Activity Log */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>Activity Log</div>
          <button onClick={() => setLog([])}
            style={{ fontSize: '11px', color: '#94a3b8', background: 'none',
              border: 'none', cursor: 'pointer' }}>Clear</button>
        </div>
        <div style={{ padding: '12px 16px', maxHeight: '180px',
          overflowY: 'auto', background: '#0f172a' }}>
          {log.length === 0 ? (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
              color: '#334155', fontStyle: 'italic' }}>
              No activity yet. Apply a slice to begin.
            </div>
          ) : [...log].reverse().map((entry, i) => (
            <div key={i} style={{ fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px', marginBottom: '3px', display: 'flex', gap: '10px' }}>
              <span style={{ color: '#334155', flexShrink: 0 }}>{entry.ts}</span>
              <span style={{ color: logColors[entry.type] || '#64748b' }}>{entry.msg}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
