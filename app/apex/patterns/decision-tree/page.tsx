"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DecisionTreeRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/apex/patterns');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">🌳</div>
        <p className="text-indigo-200 text-sm">Loading Decision Trees...</p>
      </div>
    </div>
  );
}
