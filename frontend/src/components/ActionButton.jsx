export default function ActionButton({ onClick, children, color = 'green', disabled = false, loading = false }) {
  const colors = {
    green:  'border-radar-green text-radar-green hover:bg-radar-green hover:text-black',
    red:    'border-red-500 text-red-400 hover:bg-red-500 hover:text-white',
    yellow: 'border-yellow-500 text-yellow-400 hover:bg-yellow-500 hover:text-black',
    blue:   'border-blue-500 text-blue-400 hover:bg-blue-500 hover:text-white',
    purple: 'border-purple-500 text-purple-400 hover:bg-purple-500 hover:text-white',
  }
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className={`px-4 py-1.5 text-xs font-mono font-bold border rounded transition-all duration-150
        ${colors[color]} ${disabled || loading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
      {loading ? '...' : children}
    </button>
  )
}
