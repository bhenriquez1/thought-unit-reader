// pages/_app.tsx
import { AppProps } from "next/app";
import { ThemeProvider } from "next-themes";
import "../styles/globals.css"; // ✅ Correct import
import "react-tooltip/dist/react-tooltip.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <Component {...pageProps} />
    </ThemeProvider>
  );
}