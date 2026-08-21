"use client";

// Elena's own route — extracted from pages/index.tsx's "elena" shell tab
// (see the Avrrio product-split migration plan, Phase 0). ElenaChildWorkspace
// already owns its entire document/profile/reward state and IndexedDB
// persistence independent of the adult Reader; this page is just the route
// boundary that used to be an activeShellTab branch. Mirrors app/apex/page.tsx's
// pattern: "use client" + an ErrorBoundary around the workspace so a crash
// here can never take down the adult Reader (it couldn't anyway, now that
// they're separate routes, but this also keeps Elena's own page from
// hard-crashing to a blank screen for the child).

import ErrorBoundary from "@/components/ErrorBoundary";
import ElenaChildWorkspace from "@/components/elena/ElenaChildWorkspace";

export default function ElenaPage() {
  return (
    <ErrorBoundary
      onError={(error) => console.error("Elena workspace error:", { message: error.message, name: error.name })}
    >
      <ElenaChildWorkspace />
    </ErrorBoundary>
  );
}
