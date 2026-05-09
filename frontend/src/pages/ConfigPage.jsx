import { useState, useEffect } from 'react'
import { api } from '../utils/api'

export default function ConfigPage() {
  const [configs, setConfigs] = useState([])
  const [sel, setSel] = useState(null)
  const [content, setContent] = useState('')
  const [orig, setOrig] = useState('')
  const [loading, setLoading] = useState('')
  const [msg, setMsg] = useState(null)

  useEffect(() => { api.get('/config/list').then(d => setConfigs(d.configs || [])) }, [])

  const load = async (key) => {
    setLoading('load'); setMsg(null)
    try {
      const d = await api.get(`/config/read/${key}`)
      setSel(key); setContent(d.content); setOrig(d.content)
    } catch { setMsg({ err: true, text: 'Failed to load' }) }
    setLoading('')
  }

  const save = async () => {
    setLoading('save')
    try {
      const d = await api.post('/config/write', { key: sel, content })
      setOrig(content); setMsg({ err: false, text: `Saved — backup: ${d.backup}` })
    } catch { setMsg({ err: true, text: 'Save failed' }) }
    setLoading('')
  }

  const restore = async () => {
    setLoading('restore')
    try { await api.post(`/config/restore/${sel}`); await load(sel); setMsg({ err: false, text: 'Restored from backup' }) }
    catch { setMsg({ err: true, text: 'No backup found' }) }
    setLoading('')
  }

  const dirty = content !== orig

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

      {/* Header */}
      <div>
        <div className="page-title">Config Editor</div>
        <div className="page-subtitle">Edit, save, and restore OAI configuration files</div>
        <div className="divider" style={{ marginTop: '12px' }} />
      </div>

      <div style={{ display: 'flex', gap: '16px', flex: 1 }}>

        {/* File list */}
        <div style={{ width: '170px', flexShrink: 0 }}>
          <div className="data-label" style={{ marginBottom: '8px', display: 'block' }}>Files</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {configs.map(c => (
              <button key={c.key} onClick={() => load(c.key)}
                style={{
                  width: '100%', textAlign: 'left', padding: '9px 11px', cursor: 'pointer', transition: 'all 0.15s',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', borderRadius: '8px',
                  border: sel === c.key ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                  background: sel === c.key ? '#eff6ff' : '#ffffff',
                  color: sel === c.key ? '#1d4ed8' : c.exists ? '#0f172a' : '#cbd5e1',
                  opacity: c.exists ? 1 : 0.6,
                  boxShadow: sel === c.key ? '0 0 0 3px rgba(59,130,246,0.1)' : 'none',
                }}>
                <div style={{ fontWeight: sel === c.key ? '600' : '400' }}>{c.key}</div>
                <div style={{ fontSize: '10px', color: c.exists ? '#94a3b8' : '#ef4444', marginTop: '2px' }}>
                  {c.exists ? `${(c.size/1024).toFixed(1)} KB` : 'not found'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {msg && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', padding: '10px 14px', borderRadius: '8px',
              border: `1px solid ${msg.err ? '#fca5a5' : '#86efac'}`,
              background: msg.err ? '#fff1f2' : '#f0fdf4',
              color: msg.err ? '#b91c1c' : '#15803d',
            }}>
              {msg.text}
            </div>
          )}

          {sel ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', fontWeight: '600', color: '#0f172a' }}>{sel}</span>
                  {dirty && <span style={{ fontSize: '11px', color: '#b45309', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '5px', padding: '1px 7px' }}>● unsaved</span>}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn btn-warning" onClick={() => { setContent(orig); setMsg(null) }} disabled={!dirty} style={{ padding: '5px 11px', fontSize: '11px' }}>↺ Revert</button>
                  <button className="btn btn-purple"  onClick={restore} disabled={!!loading} style={{ padding: '5px 11px', fontSize: '11px' }}>{loading==='restore' ? '…' : '⬇ Backup'}</button>
                  <button className="btn btn-success" onClick={save} disabled={!dirty || !!loading} style={{ padding: '5px 11px', fontSize: '11px' }}>{loading==='save' ? '…' : '💾 Save'}</button>
                </div>
              </div>
              <textarea value={content} onChange={e => setContent(e.target.value)} spellCheck={false}
                style={{
                  width: '100%', height: '60vh', resize: 'none', borderRadius: '10px',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '12.5px', lineHeight: '1.7',
                  background: '#fafafa', color: '#0f172a',
                  border: '1px solid #e2e8f0', padding: '14px 16px', outline: 'none',
                  tabSize: 2,
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)' }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
                onKeyDown={e => {
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    const s = e.target.selectionStart
                    setContent(c => c.substring(0,s) + '  ' + c.substring(e.target.selectionEnd))
                    setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 2 }, 0)
                  }
                }}
              />
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', borderRadius: '12px', border: '2px dashed #e2e8f0', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: '#cbd5e1' }}>
              Select a config file
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
