/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}', './app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'custom-green': 'rgba(152, 221, 148, 0.82)',  // Add RGBA color here
      },
      fontFamily: {
        'aptos': ['Aptos', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
