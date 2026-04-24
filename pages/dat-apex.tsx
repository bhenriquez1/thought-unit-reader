import { useEffect } from "react";
import { useRouter } from "next/router";

export default function DatApexRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/apex");
  }, [router]);

  return <div className="min-h-screen bg-slate-950 text-white p-6">Redirecting to DAT Apex…</div>;
}
