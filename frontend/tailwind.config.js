/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        ink: '#0B1220',
        panel: '#111827',
        accent: {
          cyan: '#22D3EE',
          purple: '#8B5CF6',
          blue: '#2563EB',
        },
      },
      boxShadow: {
        premium: '0 24px 80px -32px rgba(15, 23, 42, 0.45)',
        glow: '0 0 0 1px rgba(34, 211, 238, 0.25), 0 18px 50px -20px rgba(34, 211, 238, 0.45)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        flow: {
          '0%': { strokeDashoffset: '24' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.2s linear infinite',
        flow: 'flow 0.8s linear infinite',
      },
    },
  },
  plugins: [],
};
