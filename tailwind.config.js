/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        canvas: 'var(--c-bg)',
        forest: 'var(--c-text)',
        sage: 'var(--c-text-secondary)',
        brand: {
          DEFAULT: 'var(--c-brand)',
          hover: 'var(--c-brand-hover)',
          tint: 'rgba(255, 75, 85, 0.12)',
        },
        dsynq: {
          border: 'var(--c-surface-border)',
          surface: 'var(--c-surface)',
          hover: 'var(--c-table-row-hover)',
        },
        status: {
          success: 'var(--c-success)',
          successBg: 'var(--c-success-bg)',
          error: 'var(--c-error)',
          errorBg: 'var(--c-error-bg)',
        },
      },
      boxShadow: {
        card: 'var(--c-glass-shadow)',
        glow: '0 0 28px -4px rgba(255, 75, 85, 0.45)',
        'glow-hover': '0 0 32px -2px rgba(255, 75, 85, 0.6)',
      },
    },
  },
  plugins: [],
};
