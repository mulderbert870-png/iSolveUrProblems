/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}', './app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'custom-green': 'rgba(152, 221, 148, 0.82)',  // Add RGBA color here
        // aiASAP amber — re-aimed 2026-06-19 from old #D4A943 to the brand gradient stops
        'gold': '#d7a05a',        // mid amber (was #D4A943)
        'gold-light': '#ffe9c2',  // cream top stop (was #E8B66B)
        'gold-dark': '#3a2108',   // dark brown bottom stop (was #B88E2F)
        'gold-text': '#f1c477',   // warm text amber used in .btn-inset
      },
      fontFamily: {
        'aptos': ['Aptos', 'sans-serif'],
        'lora': ['Lora', 'Georgia', 'serif'],
        'archivo': ['"Archivo Black"', '"Arial Black"', 'Impact', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
