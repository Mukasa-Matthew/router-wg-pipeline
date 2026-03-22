/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        'display-lg': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        'display': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        'title': ['1.25rem', { lineHeight: '1.4' }],
        'body': ['0.9375rem', { lineHeight: '1.5' }],
        'caption': ['0.8125rem', { lineHeight: '1.4' }],
        'label': ['0.75rem', { lineHeight: '1.3', letterSpacing: '0.02em' }],
      },
      colors: {
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        accent: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        navy: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      boxShadow: {
        'card': '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 12px rgb(0 0 0 / 0.06), 0 2px 6px -2px rgb(0 0 0 / 0.04)',
        'elevated': '0 8px 24px rgb(0 0 0 / 0.08), 0 2px 8px -2px rgb(0 0 0 / 0.04)',
        'glow': '0 0 0 1px rgb(16 185 129 / 0.08), 0 4px 12px -2px rgb(16 185 129 / 0.15)',
        'soft': '0 2px 8px rgb(0 0 0 / 0.04)',
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
