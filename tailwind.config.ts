import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0c0f14',
          card: '#141925',
          elev: '#1c2333',
        },
        border: {
          DEFAULT: '#2a3344',
        },
        accent: {
          DEFAULT: '#f5c518',
          blue: '#58a6ff',
        },
        muted: '#8892a8',
        status: {
          planning: '#475569',
          playing: '#3b82f6',
          completed: '#22c55e',
          on_hold: '#f59e0b',
          dropped: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 8px 30px rgba(0,0,0,.5)',
      },
      keyframes: {
        wiggle: {
          // Subtle iPhone-style reorder jiggle — applied to every card while
          // custom-sort is active. A small per-card animation-delay
          // (set inline via --wig-delay) keeps them out of sync.
          '0%, 100%': { transform: 'rotate(-0.6deg)' },
          '50%': { transform: 'rotate(0.6deg)' },
        },
      },
      animation: {
        wiggle: 'wiggle 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
