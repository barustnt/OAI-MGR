import { useState, useEffect, useRef } from 'react'

const IFACE_COLORS = {
  'demo-oai':   { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE'},
  'oaitun_ue1': { color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0'},
  'lo':         { color: '#7C3AED', bg: '#FAF5FF', border: '#DDD6FE'},
  'any':        { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A'},
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`
  return `${(bytes/1024/1024).toFixed(2)} MB`
}

export default function PcapPage() {
  const [interfaces, setInterfaces] = useState({})
  const [status, setStatus]         = useState(null)
  const [files, setFiles]           = useState([])
  const [selected, setSelected]     = useState('demo-oai')
  const [maxSize, setMaxSize]       = useState(100)
  const [label, setLabel]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [elapsed, setElapsed]       = useState(0)
  const timerRef = useRef(null)

  const fetchAll = async () => {
    try {
      const [ifaceR, statusR, listR] = await Promise.all([
        fetch('/api/pcap/interfaces'),
        fetch('/api/pcap/status'),
        fetch('/api/pcap/list'),
      ])
      setInterfaces(await ifaceR.json())
      const s = await statusR.json(); setStatus(s)
      const l = await listR.json(); setFiles(l.files || [])
    } catch {}
  }

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 3000); return () => clearInterval(t) }, [])

  // Elapsed timer when capture is running
  useEffect(() => {
    if (status?.running && status?.started_at) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - new Date(status.started_at).getTime()) / 1000))
      }, 1000)
    } else {
      clearInterval(timerRef.current)
      setElapsed(0)
    }
    return () => clearInterval(timerRef.current)
  }, [status?.running, status?.started_at])

  const startCapture = async () => {
    setLoading(true)
    try {
      await fetch('/api/pcap/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interface: selected, max_size_mb: maxSize, label }),
      })
      await fetchAll()
    } catch {}
    setLoading(false)
  }

  const stopCapture = async () => {
    setLoading(true)
    try {
      await fetch('/api/pcap/stop', { method: 'POST' })
      await fetchAll()
    } catch {}
    setLoading(false)
  }

  const deleteFile = async (filename) => {
    if (!confirm(`Delete ${filename}?`)) return
    try {
      await fetch(`/api/pcap/delete/${encodeURIComponent(filename)}`, { method: 'DELETE' })
      await fetchAll()
    } catch {}
  }

  const fmtElapsed = (s) => {
    const m = Math.floor(s/60), sec = s%60
    return `${m}:${sec.toString().padStart(2,'0')}`
  }

  const isRunning = status?.running
  const iface = IFACE_COLORS[selected] || IFACE_COLORS['any']

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'22px' }}>

      {/* Header */}
      <div>
        <div className="page-title">PCAP Capture</div>
        <div className="page-subtitle">Capture 5G network traces for Wireshark analysis and debugging</div>
        <div className="divider" style={{ marginTop:'12px' }} />
      </div>

      {/* Live status banner — only when running */}
      {isRunning && (
        <div style={{ padding:'16px 20px', borderRadius:'12px',
          background:'#FEF9C3', border:'2px solid #FDE047',
          display:'flex', alignItems:'center', gap:'16px' }}>
          <div style={{ width:'10px', height:'10px', borderRadius:'50%',
            background:'#EF4444', animation:'pulse 1s infinite',
            flexShrink:0 }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'13px', fontWeight:'700', color:'#713F12' }}>
              Capturing on {status.interface_label} — {status.interface}
            </div>
            <div style={{ fontSize:'11px', color:'#92400E', fontFamily:"'JetBrains Mono', monospace", marginTop:'2px' }}>
              {fmtElapsed(elapsed)} elapsed
              {status.current_size_mb !== undefined && ` · ${status.current_size_mb} MB`}
              {status.max_size_mb && ` / ${status.max_size_mb} MB max`}
            </div>
          </div>
          <div style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:'11px',
            color:'#92400E' }}>{status.filename}</div>
          <button onClick={stopCapture} disabled={loading}
            style={{ padding:'8px 18px', borderRadius:'8px', border:'none',
              background:'#DC2626', color:'#fff', fontSize:'13px', fontWeight:'700',
              cursor:loading?'not-allowed':'pointer', whiteSpace:'nowrap' }}>
            ⏹ Stop
          </button>
        </div>
      )}

      {/* Interface selector + start */}
      <div className="card" style={{ padding:'20px' }}>
        <div style={{ fontSize:'13px', fontWeight:'600', color:'#0f172a', marginBottom:'16px' }}>
          New Capture
        </div>

        {/* Interface cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'16px' }}>
          {Object.entries(interfaces).map(([key, info]) => {
            const c = IFACE_COLORS[key] || IFACE_COLORS['any']
            const isSelected = selected === key
            return (
              <button key={key} onClick={() => !isRunning && setSelected(key)}
                disabled={!info.available || isRunning}
                style={{
                  padding:'12px 10px', borderRadius:'10px', border:'2px solid',
                  borderColor: isSelected ? c.color : '#e2e8f0',
                  background: isSelected ? c.bg : info.available ? '#fff' : '#f8fafc',
                  cursor: !info.available || isRunning ? 'not-allowed' : 'pointer',
                  opacity: !info.available ? 0.4 : 1,
                  textAlign:'left', transition:'all 0.15s',
                }}>
                <div style={{ fontSize:'18px', marginBottom:'4px' }}>{c.emoji}</div>
                <div style={{ fontSize:'11px', fontWeight:'700', color: isSelected ? c.color : '#0f172a',
                  fontFamily:"'JetBrains Mono', monospace" }}>{key}</div>
                <div style={{ fontSize:'10px', color:'#64748b', marginTop:'2px' }}>{info.label}</div>
                {!info.available && (
                  <div style={{ fontSize:'9px', color:'#ef4444', marginTop:'2px' }}>not available</div>
                )}
              </button>
            )
          })}
        </div>

        {/* Selected interface description */}
        {interfaces[selected] && (
          <div style={{ padding:'10px 14px', background: iface.bg,
            border:`1px solid ${iface.border}`, borderRadius:'8px', marginBottom:'16px' }}>
            <div style={{ fontSize:'11px', color: iface.color }}>
              {interfaces[selected].description}
              {interfaces[selected].filter &&
                <span style={{ fontFamily:"'JetBrains Mono', monospace",
                  marginLeft:'6px' }}>· filter: {interfaces[selected].filter}</span>
              }
            </div>
          </div>
        )}

        {/* Options row */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
          <div>
            <div style={{ fontSize:'11px', color:'#64748b', fontWeight:'600', marginBottom:'6px' }}>
              Max file size (MB)
            </div>
            <input type="number" value={maxSize} min={1} max={2000}
              onChange={e => setMaxSize(Number(e.target.value))}
              disabled={isRunning}
              style={{ width:'100%', padding:'8px 12px', borderRadius:'8px',
                border:'1px solid #e2e8f0', fontSize:'13px',
                fontFamily:"'JetBrains Mono', monospace",
                background: isRunning ? '#f8fafc' : '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize:'11px', color:'#64748b', fontWeight:'600', marginBottom:'6px' }}>
              Label (optional)
            </div>
            <input type="text" value={label} placeholder="e.g. ue-attach-test"
              onChange={e => setLabel(e.target.value.replace(/[^a-zA-Z0-9_-]/g,''))}
              disabled={isRunning}
              style={{ width:'100%', padding:'8px 12px', borderRadius:'8px',
                border:'1px solid #e2e8f0', fontSize:'13px',
                fontFamily:"'JetBrains Mono', monospace",
                background: isRunning ? '#f8fafc' : '#fff' }} />
          </div>
        </div>

        {/* Start button */}
        <button onClick={startCapture} disabled={isRunning || loading}
          style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'none',
            background: isRunning ? '#e2e8f0' : '#0f172a',
            color: isRunning ? '#94a3b8' : '#fff',
            fontSize:'14px', fontWeight:'700',
            cursor: isRunning || loading ? 'not-allowed' : 'pointer',
            transition:'all 0.15s' }}>
          {isRunning ? '⏺ Capture Running...' : '⏺ Start Capture'}
        </button>
      </div>

      {/* Wireshark tips */}
      <div className="card" style={{ padding:'18px 20px' }}>
        <div style={{ fontSize:'13px', fontWeight:'600', color:'#0f172a', marginBottom:'12px' }}>
          Wireshark Analysis Tips
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px' }}>
          {[
            { label:'GTP-U (user plane)', filter:'gtp', color:'#1D4ED8' },
            { label:'GTP-C (control)', filter:'gtpv2', color:'#7C3AED' },
            { label:'NAS (5G)', filter:'nas-5gs', color:'#15803D' },
            { label:'SBI (HTTP/2)', filter:'http2', color:'#D97706' },
            { label:'SCTP (E1/F1/N2)', filter:'sctp', color:'#DC2626' },
            { label:'E2AP (RIC)', filter:'e2ap', color:'#0891B2' },
          ].map(({ label, filter, color }) => (
            <div key={filter} style={{ padding:'10px 12px', borderRadius:'8px',
              background:'#f8fafc', border:'1px solid #e2e8f0' }}>
              <div style={{ fontSize:'10px', color:'#64748b', marginBottom:'4px' }}>{label}</div>
              <div style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:'11px',
                fontWeight:'700', color, cursor:'pointer' }}
                onClick={() => navigator.clipboard?.writeText(filter)}>
                {filter} 📋
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:'12px', fontSize:'11px', color:'#94a3b8' }}>
          For GTP decoding in Wireshark: Edit → Preferences → Protocols → GTP → Enable GTP-U dissector
        </div>
      </div>

      {/* File list */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #f1f5f9',
          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:'13px', fontWeight:'600', color:'#0f172a' }}>
            Saved Captures ({files.length})
          </div>
          <div style={{ fontSize:'11px', color:'#94a3b8',
            fontFamily:"'JetBrains Mono', monospace" }}>
            ~/oai-manager/captures/
          </div>
        </div>

        {files.length === 0 ? (
          <div style={{ padding:'32px', textAlign:'center',
            color:'#cbd5e1', fontStyle:'italic', fontSize:'13px' }}>
            No captures yet — start a capture above
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {['Filename','Size','Created',''].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {files.map(f => (
                <tr key={f.filename} style={{
                  background: f.is_active ? '#FEFCE8' : undefined }}>
                  <td style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:'12px' }}>
                    {f.is_active && <span style={{ color:'#EF4444', marginRight:'6px' }}>⏺</span>}
                    {f.filename}
                  </td>
                  <td style={{ fontFamily:"'JetBrains Mono', monospace", fontSize:'12px' }}>
                    {f.size_mb} MB
                  </td>
                  <td style={{ fontSize:'12px', color:'#64748b' }}>{f.created_at}</td>
                  <td>
                    <div style={{ display:'flex', gap:'6px', justifyContent:'flex-end' }}>
                      <a href={`/api/pcap/download/${encodeURIComponent(f.filename)}`}
                        download={f.filename}
                        style={{ padding:'5px 12px', borderRadius:'6px',
                          border:'1px solid #e2e8f0', background:'#0f172a',
                          color:'#fff', fontSize:'11px', fontWeight:'600',
                          textDecoration:'none', whiteSpace:'nowrap' }}>
                        ⬇ Download
                      </a>
                      {!f.is_active && (
                        <button onClick={() => deleteFile(f.filename)}
                          style={{ padding:'5px 10px', borderRadius:'6px',
                            border:'1px solid #fecaca', background:'#fef2f2',
                            color:'#dc2626', fontSize:'11px', fontWeight:'600',
                            cursor:'pointer' }}>
                          🗑
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}
