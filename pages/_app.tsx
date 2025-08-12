// pages/_app.tsx
import type { AppProps } from "next/app";
import { ThemeProvider } from "next-themes";

// Global styles
import "@/styles/globals.css";
import "react-tooltip/dist/react-tooltip.css";
// ⬇️ move react-pdf CSS here (don’t import these inside components)
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <Component {...pageProps} />
    </ThemeProvider>
  );
}