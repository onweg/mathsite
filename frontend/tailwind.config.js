/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07070c',
          900: '#0b0b14',
          800: '#13131f',
          700: '#1c1c2b',
        },
        paper: {
          50: '#f6f2ea',
          100: '#ede6d6',
          200: '#d9ceb3',
        },
        gold: {
          400: '#e8c38a',
          500: '#d4a574',
          600: '#b7864e',
        },
        sage: {
          400: '#9fb9a9',
          500: '#6a8b78',
          600: '#4e6a5a',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
        'out-quint': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
