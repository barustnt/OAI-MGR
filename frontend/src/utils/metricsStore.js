// src/utils/metricsStore.js
// Module-level store — lives outside React, survives page navigation

const MAX = 1800  // 30 min max

const store = {
  labels: [],
  txH: [],
  rxH: [],
  prevTx: 0,
  prevRx: 0,
}

export function pushMetric(totalTx, totalRx) {
  const txD = Math.max(0, totalTx - store.prevTx)
  const rxD = Math.max(0, totalRx - store.prevRx)
  store.prevTx = totalTx
  store.prevRx = totalRx

  const t = new Date().toLocaleTimeString('en-GB', { hour12: false })
  store.labels.push(t)
  store.txH.push(+(txD / 1e6).toFixed(4))
  store.rxH.push(+(rxD / 1e6).toFixed(4))

  if (store.labels.length > MAX) {
    store.labels = store.labels.slice(-MAX)
    store.txH    = store.txH.slice(-MAX)
    store.rxH    = store.rxH.slice(-MAX)
  }
}

export function getHistory(seconds) {
  const n = Math.min(seconds, store.labels.length)
  return {
    labels: store.labels.slice(-n),
    txH:    store.txH.slice(-n),
    rxH:    store.rxH.slice(-n),
  }
}

export function clearHistory() {
  store.labels = []
  store.txH    = []
  store.rxH    = []
  store.prevTx = 0
  store.prevRx = 0
}
