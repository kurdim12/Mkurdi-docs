import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAF9F6',
        card: '#FFFFFF',
        ink: '#201D17',
        muted: '#7A7466',
        line: '#E7E3D9',
        amber: { DEFAULT: '#B45309', soft: '#FBF0DF' },
        ledger: { DEFAULT: '#166534', soft: '#E9F3EC' },
        brick: { DEFAULT: '#B42318', soft: '#FBEAE8' },
      },
      fontFamily: {
        arabic: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
