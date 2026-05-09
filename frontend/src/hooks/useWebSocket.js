import { useEffect, useRef, useState, useCallback } from 'react'
import { wsUrl } from '../utils/api'

export function useWebSocket(path, onMessage, enabled = true) {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const onMessageRef = useRef(onMessage)
  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])

  const connect = useCallback(() => {
    if (!enabled || !path) return
    const ws = new WebSocket(wsUrl(path))
    ws.onopen = () => setConnected(true)
    ws.onclose = () => { setConnected(false); setTimeout(connect, 3000) }
    ws.onerror = () => ws.close()
    ws.onmessage = (e) => onMessageRef.current(e.data)
    wsRef.current = ws
  }, [path, enabled])

  useEffect(() => { connect(); return () => wsRef.current?.close() }, [connect])
  return { connected }
}
