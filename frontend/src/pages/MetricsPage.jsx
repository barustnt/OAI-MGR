import { useState, useRef, useEffect, useCallback } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'
import { useWebSocket } from '../hooks/useWebSocket'
import { pushMetric, getHistory } from '../utils/metricsStore'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const TIME_WINDOWS = [
  { label: '30s', seconds: 30 },
  { label: '1m',  seconds: 60 },
  { label: '5m',  seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: '30m', seconds: 1800 },
]

export default function MetricsPage() {
  const [metrics, setMetrics]   = useState(null)
  const [chartData, setChartData] = useState({ labels: [], txH: [], rxH: [] })
  const [window, setWindow]     = useState(60)
  const [ueIp, setUeIp]         = useState(null)
  const [ueIpLoading, setUeIpLoading] = useState(false)
  const [sliceStatus, setSliceStatus] = useState(null)
  const [sliceLoading, setSliceLoading] = useState(false)
  const [iperfCmd, setIperfCmd] = useState({ server: false, client: false })
  const ticker = useRef(null)

  // ── Refresh chart from store every second ──────────────────────────────
  useEffect(() => {
    ticker.current = setInterval(() => {
      setChartData(getHistory(window))
    }, 1000)
    return () => clearInterval(ticker.current)
  }, [window])

  // ── Metrics WebSocket ──────────────────────────────────────────────────
  useWebSocket('/metrics/stream', d => {
    try {
      const m = JSON.parse(d)
      setMetrics(m)
      if (m.throughput) {
        pushMetric(m.throughput.total_tx, m.throughput.total_rx)
      }
    } catch {}
  })

  // ── xApp status (via /xapp proxy) ─────────────────────────────────────
  const fetchSliceStatus = useCallback(() => {
    fetch('/xapp/status')
      .then(r => r.json())
      .then(d => setSliceStatus(d))
      .catch(() => setSliceStatus(null))
  }, [])

  useEffect(() => {
    fetchSliceStatus()
    const t = setInterval(fetchSliceStatus, 5000)
    return () => clearInterval(t)
  }, [fetchSliceStatus])

  // ── UE IP discovery ────────────────────────────────────────────────────
  const discoverUeIp = async () => {
    setUeIpLoading(true)
    try {
      const r = await fetch('/api/ue/ip')
      const d = await r.json()
      setUeIp(d.ip || null)
    } catch {
      setUeIp(null)
    }
    setUeIpLoading(false)
  }

  // ── Slice control (via /xapp proxy) ───────────────────────────────────
  const sendSlice = async (speed) => {
    setSliceLoading(true)
    try {
      const r = await fetch('/xapp/slice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed }),
      })
      const d = await r.json()
      if (d.success) fetchSliceStatus()
    } catch {}
    setSliceLoading(false)
  }

  const { labels, txH, rxH } = chartData
  const sliceSpeed = sliceStatus?.current_slice?.speed
  const currentSlice = sliceStatus?.current_slice
  const amfUes  = metrics?.amf_ues || []
  const amfGnbs = metrics?.gnb || []

  const lineChartData = {
    labels,
    datasets: [
      { label: 'TX MB/s', data: txH, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.07)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 },
      { label: 'RX MB/s', data: rxH, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.07)',  fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 },
    ],
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false, animation: false,
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 10, family: 'JetBrains Mono' }, maxTicksLimit: 8, maxRotation: 0 }, grid: { color: 'rgba(0,0,0,0.04)' } },
      y: { ticks: { color: '#94a3b8', font: { size: 10, family: 'JetBrains Mono' } }, grid: { color: 'rgba(0,0,0,0.04)' }, min: 0 },
    },
    plugins: { legend: { labels: { color: '#64748b', font: { size: 12, family: 'Inter' }, boxWidth: 16 } } },
  }

  const kpis = [
    { label: 'Connected UEs',  value: metrics?.ue_count ?? '0', color: '#1d4ed8' },
    { label: 'Connected gNBs', value: metrics?.gnb?.length ?? '0', color: '#15803d' },
    { label: 'TX Total', value: metrics?.throughput ? `${(metrics.throughput.total_tx/1e6).toFixed(2)} MB` : '0 MB', color: '#1d4ed8' },
    { label: 'RX Total', value: metrics?.throughput ? `${(metrics.throughput.total_rx/1e6).toFixed(2)} MB` : '0 MB', color: '#15803d' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

      {/* Header */}
      <div>
        <div className="page-title">Metrics & Telemetry</div>
        <div className="page-subtitle">Live data streams — updated every second</div>
        <div className="divider" style={{ marginTop: '12px' }} />
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {kpis.map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: '16px 18px' }}>
            <div className="data-label" style={{ marginBottom: '8px' }}>{label}</div>
            <div className="data-value" style={{ fontSize: '22px', color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Chart + time window */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>Throughput — Live (MB/s)</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {TIME_WINDOWS.map(w => (
              <button key={w.seconds} onClick={() => setWindow(w.seconds)}
                style={{
                  padding: '4px 10px', borderRadius: '6px', border: '1px solid',
                  borderColor: window === w.seconds ? '#3b82f6' : '#e2e8f0',
                  background: window === w.seconds ? '#eff6ff' : '#fff',
                  color: window === w.seconds ? '#2563eb' : '#64748b',
                  fontSize: '11px', fontWeight: window === w.seconds ? '700' : '500',
                  cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", transition: 'all 0.15s',
                }}
              >{w.label}</button>
            ))}
          </div>
        </div>
        <div style={{ height: '200px' }}>
          <Line data={lineChartData} options={chartOpts} />
        </div>
      </div>

      {/* Slice Control + UE IP + iperf — 3 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>

        {/* Slice control */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>  Slice Control</div>
            <div style={{
              fontSize: '10px', fontFamily: "'JetBrains Mono', monospace",
              padding: '2px 8px', borderRadius: '20px',
              background: sliceStatus?.ric_running ? '#f0fdf4' : '#fef2f2',
              color: sliceStatus?.ric_running ? '#15803d' : '#dc2626',
              border: `1px solid ${sliceStatus?.ric_running ? '#bbf7d0' : '#fecaca'}`,
            }}>
              {sliceStatus?.ric_running ? '● RIC online' : sliceStatus === null ? '○ connecting...' : '○ RIC offline'}
            </div>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', marginBottom: '4px' }}>ACTIVE</div>
            {currentSlice?.speed ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '16px', fontWeight: '700', color: sliceSpeed === 'high' ? '#15803d' : '#dc2626', fontFamily: "'JetBrains Mono', monospace" }}>
                  {sliceSpeed.toUpperCase()}
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>{currentSlice.prb_pct}% PRBs</span>
                <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 'auto' }}>{currentSlice.applied_at}</span>
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No slice applied</div>
            )}
          </div>

          {/* PRB bar */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${currentSlice?.prb_pct ?? 0}%`,
                background: sliceSpeed === 'high' ? 'linear-gradient(90deg,#22c55e,#15803d)' : 'linear-gradient(90deg,#f97316,#dc2626)',
                borderRadius: '3px', transition: 'width 0.6s ease',
              }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {['high','low'].map(speed => (
              <button key={speed} onClick={() => sendSlice(speed)}
                disabled={sliceLoading || sliceSpeed === speed}
                style={{
                  padding: '8px 6px', borderRadius: '8px', border: '2px solid',
                  borderColor: sliceSpeed === speed ? (speed === 'high' ? '#15803d' : '#dc2626') : '#e2e8f0',
                  background: sliceSpeed === speed ? (speed === 'high' ? '#f0fdf4' : '#fef2f2') : '#fff',
                  color: sliceSpeed === speed ? (speed === 'high' ? '#15803d' : '#dc2626') : '#374151',
                  fontSize: '11px', fontWeight: '700', cursor: sliceLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s', opacity: sliceLoading ? 0.6 : 1, textAlign: 'center',
                }}
              >
                {speed === 'high' ? '🟢' : '🔴'} {speed.toUpperCase()}<br/>
                <span style={{ fontSize: '9px', fontWeight: '400', color: '#94a3b8', fontFamily: "'JetBrains Mono', monospace" }}>
                  {speed === 'high' ? '80%' : '25%'} PRBs
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* UE IP */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '14px' }}>  UE IP Address</div>

          {ueIp ? (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: '18px', fontWeight: '700', color: '#15803d',
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px',
              padding: '10px 14px', marginBottom: '10px', letterSpacing: '0.05em',
            }}>{ueIp}</div>
          ) : (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#94a3b8',
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
              padding: '10px 14px', marginBottom: '10px',
            }}>Not discovered yet</div>
          )}

          <button onClick={discoverUeIp} disabled={ueIpLoading}
            style={{
              width: '100%', padding: '8px', borderRadius: '8px', border: 'none',
              background: ueIpLoading ? '#e2e8f0' : '#0f172a',
              color: ueIpLoading ? '#94a3b8' : '#fff',
              fontSize: '12px', fontWeight: '600', cursor: ueIpLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s', marginBottom: '12px',
            }}
          >{ueIpLoading ? 'Discovering...' : '  Discover UE IP'}</button>

          <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.6' }}>
            <div style={{ fontWeight: '600', marginBottom: '4px' }}>Manual check:</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#94a3b8', background: '#f8fafc', padding: '6px 8px', borderRadius: '6px' }}>
              ip addr show oaitun_ue1
            </div>
          </div>
        </div>

        {/* iperf3 */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '14px' }}>  iperf3 Test</div>

          <div style={{ background: '#0f172a', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', color: '#475569', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Step 1 — Server</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#e2e8f0', marginBottom: '12px' }}>
              docker exec oai-ext-dn iperf3 -s
            </div>
            <div style={{ fontSize: '10px', color: '#475569', fontWeight: '600', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Step 2 — Client</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#e2e8f0', lineHeight: '1.8' }}>
              iperf3 -c 192.168.70.135 \<br/>
              &nbsp;&nbsp;-B <span style={{ color: ueIp ? '#22c55e' : '#f97316' }}>{ueIp || '<UE_IP>'}</span> \<br/>
              &nbsp;&nbsp;-u -b 20M -t 3600 \<br/>
              &nbsp;&nbsp;--parallel 4
            </div>
            <div style={{ marginTop: '10px', fontSize: '10px', color: '#475569', fontStyle: 'italic' }}>
              # Switch slice HIGH↔LOW and watch<br/>
              # the chart above change in real time
            </div>
          </div>

          {/* Quick copy buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button
              onClick={() => navigator.clipboard?.writeText('docker exec oai-ext-dn iperf3 -s')}
              style={{
                padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0',
                background: '#f8fafc', color: '#374151', fontSize: '11px', fontWeight: '500',
                cursor: 'pointer', textAlign: 'left', fontFamily: "'JetBrains Mono', monospace",
              }}
            >  Copy server cmd</button>
            <button
              onClick={() => {
                const cmd = `iperf3 -c 192.168.70.135 -B ${ueIp || '<UE_IP>'} -u -b 20M -t 3600 --parallel 4`
                navigator.clipboard?.writeText(cmd)
              }}
              style={{
                padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0',
                background: '#f8fafc', color: '#374151', fontSize: '11px', fontWeight: '500',
                cursor: 'pointer', textAlign: 'left', fontFamily: "'JetBrains Mono', monospace",
              }}
            >  Copy client cmd {ueIp ? `(${ueIp})` : ''}</button>
          </div>
        </div>
      </div>

      {/* gNB Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>gNBs Information</div>
        <table className="data-table">
          <thead><tr>{['Index','Status','Global ID','gNB Name','PLMN'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {amfGnbs.length === 0
              ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: '#cbd5e1', fontStyle: 'italic' }}>No gNBs connected</td></tr>
              : amfGnbs.map((g, i) => <tr key={i}>{[g.index, g.status, g.global_id, g.gnb_name, g.plmn].map((v, j) => <td key={j} style={{ color: j===1?'#15803d':undefined }}>{v}</td>)}</tr>)
            }
          </tbody>
        </table>
      </div>

      {/* UE Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>UEs Information (AMF)</div>
        <table className="data-table">
          <thead><tr>{['Index','State','IMSI','GUTI','RAN NGAP','AMF NGAP','PLMN','Cell ID'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {amfUes.length === 0
              ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: '#cbd5e1', fontStyle: 'italic' }}>No UEs registered</td></tr>
              : amfUes.map((u, i) => <tr key={i}>{[u.index, u.state, u.imsi, u.guti, u.ran_ue_ngap_id, u.amf_ue_ngap_id, u.plmn, u.cell_id].map((v, j) => <td key={j} style={{ color: j===1?'#15803d':j===2?'#1d4ed8':undefined }}>{v}</td>)}</tr>)
            }
          </tbody>
        </table>
      </div>

    </div>
  )
}
