// pages/_app.tsx
import type { AppProps } from "next/app";
import { ThemeProvider } from "next-themes";

// Global styles
import "@/styles/globals.css";
import "react-tooltip/dist/react-tooltip.css";

// Load react-pdf layer styles once (globally)
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"   // change to "system" if you want OS-based theme by default
      enableSystem
    >
      <Component {...pageProps} />
    </ThemeProvider>
  );
}