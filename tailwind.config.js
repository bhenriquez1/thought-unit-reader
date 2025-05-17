/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        dyslexic: ["OpenDyslexic", "sans-serif"]
      }
    }
  },
  darkMode: 'class', // for dark mode toggle
  plugins: []
}