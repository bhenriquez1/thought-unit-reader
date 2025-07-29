// tailwind.config.ts
import { type Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{ts,tsx}",       // ✅ Standard Next.js folders
    "./components/**/*.{ts,tsx}",  // ✅ Good
    "./app/**/*.{ts,tsx}",         // ✅ For App Router support
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", ...fontFamily.sans], // ✅ Adds Inter as first sans font
      },
    },
  },
  plugins: [require("tailwindcss-animate")], // ✅ Only if installed
};

export default config;