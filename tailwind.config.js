/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/client/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        border: 'var(--border)',
        input: 'var(--input)',
        primary: { DEFAULT: 'var(--primary)', edge: 'var(--primary-edge)', foreground: 'var(--primary-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        ring: 'var(--ring)',
        chip: 'var(--chip)',
        note: { DEFAULT: 'var(--note)', border: 'var(--note-border)' },
        warm: { DEFAULT: 'var(--warm)', foreground: 'var(--warm-foreground)' },
      },
      borderRadius: { card: '18px', control: '14px' },
      boxShadow: {
        card: '0 2px 10px rgba(180, 120, 40, 0.08)',
        'primary-edge': '0 3px 0 var(--primary-edge)',
      },
      fontFamily: { sans: ['Nunito', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
