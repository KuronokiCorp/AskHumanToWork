/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Single warm terracotta accent — the Claude Code aesthetic's one non-zinc hue.
        // Used for active states, primary actions, overdue counts. Everything else stays zinc.
        accent: {
          DEFAULT: '#CC785C',
          100: '#F1D8CC',
          200: '#E6B8A5',
          300: '#E0A186',
          400: '#D68B6C',
          500: '#CC785C',
          600: '#B5613F',
          700: '#8F4A30',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(24 24 27 / 0.04), 0 1px 6px -1px rgb(24 24 27 / 0.06)',
        'card-hover': '0 2px 4px 0 rgb(24 24 27 / 0.05), 0 8px 24px -4px rgb(24 24 27 / 0.12)',
        glow: '0 0 24px -4px rgb(124 58 237 / 0.35)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        pop: 'pop 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.8)' },
          '60%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
