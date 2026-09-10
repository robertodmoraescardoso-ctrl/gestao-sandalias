/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#151A21',
        panel: '#1D242E',
        sand: '#E7B24C',
        esmeralda: '#0E8060',
        alerta: '#C0392B',
        canvas: '#F6F5F1',
        borda: '#E4E2DB',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
