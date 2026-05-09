export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        display: ['"Space Mono"', 'monospace'],
      },
      colors: {
        radar: { green: '#00ff87', dim: '#00cc6a', red: '#ff4757', yellow: '#ffa502', blue: '#1e90ff' }
      }
    }
  },
  plugins: []
}
