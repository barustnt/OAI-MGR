import { useState, useEffect } from 'react'
import DashboardPage from './pages/DashboardPage'
import CorePage from './pages/CorePage'
import GnbPage from './pages/GnbPage'
import UEPage from './pages/UEPage'
import MetricsPage from './pages/MetricsPage'
import ConfigPage from './pages/ConfigPage'
import XAppPage from './pages/XAppPage'
import PcapPage from './pages/PcapPage'

// ── Nav groups ────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard',  icon: '⊞' },
      { id: 'metrics',   label: 'Metrics',    icon: '▦' },
    ]
  },
  {
    label: '5G Stack',
    items: [
      { id: 'core', label: 'Core Net',   icon: '⬡' },
      { id: 'gnb',  label: 'gNB',        icon: '◎' },
      { id: 'ue',   label: 'UE / RFSIM', icon: '◇' },
    ]
  },
  {
    label: 'RAN Intelligence',
    items: [
      { id: 'xapp',  label: 'xApp / Slice'},
    ]
  },
  {
    label: 'System',
    items: [
      { id: 'pcap', label: 'PCAP Capture'},
      { id: 'config', label: 'Config', icon: '⚙' },
    ]
  },
]

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [time, setTime] = useState(new Date())
  const [ricStatus, setRicStatus] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Poll xApp server status for sidebar indicator
  useEffect(() => {
    const check = () => {
      fetch('http://localhost:7000/status')
        .then(r => r.json())
        .then(d => setRicStatus(d))
        .catch(() => setRicStatus(null))
    }
    check()
    const t = setInterval(check, 8000)
    return () => clearInterval(t)
  }, [])

  const pages = {
    dashboard: <DashboardPage onNavigate={setPage} />,
    core:      <CorePage />,
    gnb:       <GnbPage />,
    ue:        <UEPage />,
    metrics:   <MetricsPage />,
    config:    <ConfigPage />,
    xapp:      <XAppPage />,
    pcap:      <PcapPage />,
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'Inter', sans-serif" }}>

      {/* Sidebar */}
      <aside style={{
        width: '220px',
        flexShrink: 0,
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '2px 0 8px rgba(0,0,0,0.04)',
      }}>

        {/* Logo */}
        <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px', color: '#fff', fontWeight: '700',
            }}>O</div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.01em' }}>OAI MGR</div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '500' }}>5G Network Control</div>
            </div>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#cbd5e1', marginTop: '8px' }}>
            {time.toLocaleTimeString('en-GB', { hour12: false })}
          </div>
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          {NAV_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: '4px' }}>
              {/* Group label */}
              <div style={{
                fontSize: '9px',
                fontWeight: '700',
                color: '#cbd5e1',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '8px 10px 4px',
              }}>{group.label}</div>

              {group.items.map(({ id, label, icon }) => {
                const active = page === id
                // Show RIC status dot on xApp item
                const isXapp = id === 'xapp'
                const xappOnline = ricStatus?.ric_running

                return (
                  <button key={id} onClick={() => setPage(id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '9px 10px',
                      marginBottom: '1px',
                      borderRadius: '8px',
                      background: active ? '#eff6ff' : 'transparent',
                      border: 'none',
                      color: active ? '#2563eb' : '#64748b',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: active ? '600' : '500',
                      textAlign: 'left',
                      transition: 'all 0.15s',
                      fontFamily: "'Inter', sans-serif",
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: '14px', opacity: 0.8 }}>{icon}</span>
                    <span style={{ flex: 1 }}>{label}</span>
                    {/* xApp RIC status indicator */}
                    {isXapp && ricStatus !== null && (
                      <span style={{
                        width: '6px', height: '6px',
                        borderRadius: '50%',
                        background: xappOnline ? '#22c55e' : '#f97316',
                        flexShrink: 0,
                      }} />
                    )}
                    {/* Active dot */}
                    {active && !isXapp && (
                      <span style={{ width: '5px', height: '5px', background: '#3b82f6', borderRadius: '50%' }} />
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '14px 18px', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
            <span className="dot dot-green" />
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#15803d' }}>System Online</span>
          </div>
          {ricStatus && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: ricStatus.ric_running ? '#22c55e' : '#f97316',
                display: 'inline-block',
              }} />
              <span style={{ fontSize: '11px', color: ricStatus.ric_running ? '#15803d' : '#92400e', fontWeight: '500' }}>
                RIC {ricStatus.ric_running ? 'Online' : 'Offline'}
              </span>
              {ricStatus.current_slice?.speed && (
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '9px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: '700',
                  color: ricStatus.current_slice.speed === 'high' ? '#15803d' : '#dc2626',
                  background: ricStatus.current_slice.speed === 'high' ? '#f0fdf4' : '#fef2f2',
                  padding: '1px 5px',
                  borderRadius: '4px',
                }}>
                  {ricStatus.current_slice.speed.toUpperCase()}
                </span>
              )}
            </div>
          )}
          <div style={{ fontSize: '11px', color: '#cbd5e1', fontFamily: "'JetBrains Mono', monospace" }}>v1.0.0 — OAI SA</div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '28px', background: '#f1f5f9' }}>
        {pages[page]}
      </main>
    </div>
  )
}
