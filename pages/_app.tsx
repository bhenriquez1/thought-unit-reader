// pages/_app.tsx
import type { AppProps } from "next/app";
import React, { useEffect } from "react";
import { ThemeProvider } from "next-themes";

import { listenForAuthChanges, handleRedirectResult } from "@/lib/firebase";

// Global styles
import "@/styles/globals.css";
import "react-tooltip/dist/react-tooltip.css";
// react-pdf layer styles (global)
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

/* ---------------- Cookie helpers for middleware ---------------- */
function setCookie(name: string, value: string, maxAgeSec = 60 * 60 * 24) {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? " Secure;" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax;${secure}`;
}
function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax;`;
}

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // 1) Finish Firebase redirect sign-ins (safe to call every load)
    handleRedirectResult().catch(() => { /* noop */ });

    // 2) Keep middleware cookies in sync with Firebase auth state
    const unsub = listenForAuthChanges(async (u) => {
      if (u) {
        setCookie("rb_uid", u.uid);
        try {
          // Only a short prefix; we don't need a full token in a JS cookie for gating
          const tok = (await u.getIdToken())?.slice(0, 16) || "1";
          setCookie("rb_token", tok);
        } catch {
          setCookie("rb_token", "1");
        }
      } else {
        deleteCookie("rb_uid");
        deleteCookie("rb_token");
      }
    });
    return () => unsub();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <Component {...pageProps} />
    </ThemeProvider>
  );
}