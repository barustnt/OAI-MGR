export default function StatusBadge({ status }) {
  const map = {
    running:    'bg-green-900 text-green-400 border-green-500',
    started:    'bg-green-900 text-green-400 border-green-500',
    stopped:    'bg-red-900 text-red-400 border-red-500',
    not_running:'bg-red-900 text-red-400 border-red-500',
    not_found:  'bg-gray-800 text-gray-500 border-gray-600',
    error:      'bg-orange-900 text-orange-400 border-orange-500',
  }
  const cls = map[status] || 'bg-gray-800 text-gray-400 border-gray-600'
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${cls} uppercase tracking-wider`}>
      {status}
    </span>
  )
}
