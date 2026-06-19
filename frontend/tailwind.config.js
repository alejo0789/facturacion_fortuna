/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      colors: {
        canvas: {
          DEFAULT: 'var(--canvas)',
          2: 'var(--canvas-2)',
        },
        paper: {
          DEFAULT: 'var(--paper)',
          tinted: 'var(--paper-tinted)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-soft)',
          faint: 'var(--ink-faint)',
          mute: 'var(--ink-mute)',
        },
        rule: {
          DEFAULT: 'var(--rule)',
          soft: 'var(--rule-soft)',
          strong: 'var(--rule-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          vivid: 'var(--accent-vivid)',
          soft: 'var(--accent-soft)',
          deep: 'var(--accent-deep)',
        },
        positive: {
          DEFAULT: 'var(--positive)',
          soft: 'var(--positive-soft)',
        },
        negative: {
          DEFAULT: 'var(--negative)',
          soft: 'var(--negative-soft)',
        },
        gold: {
          DEFAULT: 'var(--gold)',
          soft: 'var(--gold-soft)',
        },
      },
      letterSpacing: {
        'wider-2': '0.18em',
        'wider-3': '0.22em',
      },
    },
  },
  plugins: [],
}
