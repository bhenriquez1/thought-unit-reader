"use client";

import React from 'react';

interface ProcedureCardProps {
  title: string;
  steps: string[];
}

export default function ProcedureCard({ title, steps }: ProcedureCardProps) {
  return (
    <div className="border border-indigo-700 rounded-lg p-3 bg-indigo-950/20 mb-3">
      <h3 className="text-sm font-semibold text-indigo-200 mb-2">{title}</h3>
      <ol className="list-decimal pl-5 text-xs text-slate-200 space-y-1">
        {steps.slice(0, 7).map((step, idx) => (
          <li key={`${title}-${idx}`}>{step}</li>
        ))}
      </ol>
      {steps.length > 7 && <p className="text-xs text-slate-400 mt-2">+ {steps.length - 7} more steps</p>}
    </div>
  );
}
