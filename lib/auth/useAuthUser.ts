// lib/auth/useAuthUser.ts
// Shared React-reactive Firebase authentication state. This hook is the one
// place any component — Pages Router or App Router — asks who is signed in.
//
// Deliberately NOT wrapped in a Context Provider: each existing call site
// (pages/_app.tsx, pages/index.tsx) already ran its own independent
// onAuthStateChanged subscription before this change, and Firebase's own
// listener is cheap — the real problem this fixes is duplicated/drifted
// LOGIC, not listener count. A Provider would add app-tree wiring risk for
// no corresponding benefit.
//
// Deliberately NOT mounted anywhere under app/ by this change either:
// lib/apex/currentApexUserId.ts's own header comment documents that
// importing lib/firebase.ts into app/apex/** measurably (and
// significantly) increased its First Load JS, and neither TestLab nor
// Elena currently gates on real auth — both are guest-only by design
// today. This hook exists so a future PR can make that call deliberately,
// for whichever product actually needs persistent cross-device identity
// first, rather than forcing the Firebase SDK onto every App Router route
// today for no product that needs it yet.

import { useEffect, useState } from "react";
import { listenForAuthChanges, handleRedirectResult, type User } from "@/lib/firebase";

export interface AuthUserState {
  user: User | null;
  /** True until the first onAuthStateChanged callback actually fires — lets
   *  a caller distinguish "we
   *  don't know yet" from "we checked, and nobody's signed in." Consumers
   *  that sync external state off `user` (e.g. a cookie mirror) should
   *  wait for loading to become false before acting, so they never act on
   *  the pre-determination `null`. */
  loading: boolean;
}

export function useAuthUser(): AuthUserState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Finish a Firebase redirect sign-in if one is in flight — safe to call
    // on every mount, matches both existing call sites' prior behavior.
    handleRedirectResult().catch(() => { /* noop */ });
    const unsubscribe = listenForAuthChanges((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, loading };
}
