// pages/_app.tsx
import type { AppProps } from "next/app";
import React, { useEffect } from "react";
import { ThemeProvider } from "next-themes";

import { useAuthUser } from "@/lib/auth/useAuthUser";

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
  // Redirect-completion + the actual onAuthStateChanged subscription both
  // now live in the shared hook (product-split Phase 2) — this effect only
  // keeps middleware cookies in sync with whatever it reports.
  const { user, loading } = useAuthUser();

  useEffect(() => {
    // Wait for the first real callback — never act on the pre-determination
    // `null` loading briefly presents, or a signed-in user's cookies would
    // get wiped for an instant on every load before Firebase re-establishes
    // the session.
    if (loading) return;
    (async () => {
      if (user) {
        setCookie("rb_uid", user.uid);
        try {
          // Only a short prefix; we don't need a full token in a JS cookie for gating
          const tok = (await user.getIdToken())?.slice(0, 16) || "1";
          setCookie("rb_token", tok);
        } catch {
          setCookie("rb_token", "1");
        }
      } else {
        deleteCookie("rb_uid");
        deleteCookie("rb_token");
      }
    })();
  }, [user, loading]);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <Component {...pageProps} />
    </ThemeProvider>
  );
}