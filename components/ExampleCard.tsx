"use client";

import React from 'react';

interface ExampleCardProps {
  problem: string;
  steps: string[];
  result: string;
}

export default function ExampleCard({ problem, steps, result }: ExampleCardProps) {
  return (
    <div className="border border-emerald-700 rounded-lg p-3 bg-emerald-950/20 mb-3">
      <p className="text-xs uppercase text-emerald-300 mb-1">Example</p>
      <p className="text-sm text-slate-100 mb-2">{problem}</p>
      <ul className="text-xs text-slate-300 list-disc pl-4">
        {steps.map((step, idx) => <li key={`example-step-${idx}`}>{step}</li>)}
      </ul>
      <p className="text-xs text-emerald-200 mt-2">Result: {result}</p>
    </div>
  );
}
