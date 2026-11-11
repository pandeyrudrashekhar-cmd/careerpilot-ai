/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f5f0ff',
          100: '#ede0ff',
          200: '#d8bfff',
          300: '#bf93ff',
          400: '#aa3bff',
          500: '#9620f0',
          600: '#7c14cc',
          700: '#6310a6',
          800: '#4f0d82',
          900: '#3c0a63',
        },
        navy: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c7d7fe',
          300: '#a5bcfc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#1e3a5f',
          800: '#1a2f4e',
          900: '#0f1d35',
          950: '#080e1a',
        },
        electric: {
          50:  '#f0f9ff',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        glow: '0 0 40px rgba(99,102,241,0.15)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
