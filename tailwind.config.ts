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
    },
  },
  plugins: [],
};
export default config;
