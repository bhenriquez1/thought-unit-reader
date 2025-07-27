// pages/_app.tsx
import { AppProps } from "next/app";
import { ThemeProvider } from "next-themes";
import "tailwindcss/tailwind.css";
import "react-tooltip/dist/react-tooltip.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    // “class” mode means we add a `.dark` class to <html> when in dark mode
    <ThemeProvider attribute="class" defaultTheme="light">
      <Component {...pageProps} />
    </ThemeProvider>
  );
}