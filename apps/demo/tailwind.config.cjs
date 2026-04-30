/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}', './app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'custom-green': 'rgba(152, 221, 148, 0.82)',  // Add RGBA color here
        // aiASAP-matched gold palette (added 2026-04-30 — site-wide gold theme)
        'gold': '#D4A943',
        'gold-light': '#E8B66B',
        'gold-dark': '#B88E2F',
      },
      fontFamily: {
        'aptos': ['Aptos', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
