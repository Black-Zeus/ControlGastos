import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paleta del proyecto (de ANALISIS_Y_RECOMENDACIONES.md)
        primary: {
          50:  '#f0fdf9',
          100: '#ccfbef',
          200: '#99f6e0',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#10b981',  // verde esmeralda — ingresos / positivo
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          DEFAULT: '#10b981',
        },
        accent: {
          warm:   '#f97316',  // coral/naranja — egresos / alertas
          purple: '#8b5cf6',  // violeta — interactivos
        },
        surface: '#fafaf7',   // fondo neutro claro
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'soft': '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card': '0 4px 6px -1px rgb(0 0 0 / 0.04), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
      },
      transitionDuration: {
        '250': '250ms',
      },
    },
  },
  plugins: [],
} satisfies Config
