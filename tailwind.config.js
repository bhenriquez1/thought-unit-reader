/** @type {import('tailwindcss').Config} */
module.exports = {
  // Enable class-based dark mode so you can toggle via <html class="dark">
  darkMode: 'class',

  // Paths to all of your template files
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',   // if you’re using the new /app directory
  ],

  theme: {
    extend: {
      // Example: add custom colors or fonts here
      // colors: {
      //   primary: {
      //     light: '#4f46e5',
      //     DEFAULT: '#4338ca',
      //     dark: '#3730a3',
      //   },
      // },
    },
  },

  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}