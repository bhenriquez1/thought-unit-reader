"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { generateStorageReport, formatBytes, type StorageReport } from '@/lib/storage/storageReport';

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-black/30 rounded-xl border border-white/10 p-5">
      <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-white/5 last:border-b-0">
      <span className="text-[12px] text-white/60">{label}</span>
      <span className="text-[12px] text-white font-mono">
        {value}
        {sub && <span className="ml-1.5 text-[10px] text-white/35">{sub}</span>}
      </span>
    </div>
  );
}

export default function DevStoragePage() {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await generateStorageReport();
      setReport(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runReport(); }, []);

  const ls = report?.localStorage;
  const idb = report?.indexedDB;
  const health = report?.health;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <header className="sticky top-0 z-40 bg-black/40 backdrop-blur-sm border-b border-white/10 px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-xs text-white/40 hover:text-white/70 transition-colors">← App</Link>
        <h1 className="text-sm font-bold text-white/80">Storage Diagnostics</h1>
        <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded font-semibold">DEV</span>
        <div className="ml-auto flex items-center gap-3">
          {report && (
            <span className="text-[10px] text-white/30 font-mono">
              {new Date(report.generatedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={runReport}
            disabled={loading}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-semibold transition-colors"
          >
            {loading ? 'Running…' : '↻ Refresh'}
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-900/20 p-4 text-sm text-rose-200">
            {error}
          </div>
        )}

        {loading && !report && (
          <div className="text-center py-16 text-white/30 text-sm">Collecting storage data…</div>
        )}

        {/* Health warnings */}
        {health && health.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-900/15 p-5 space-y-2">
            <div className="text-xs font-bold uppercase tracking-widest text-amber-400/70 mb-3">⚠ Health Warnings</div>
            {health.warnings.map((w, i) => (
              <p key={i} className="text-[12.5px] text-amber-200/80 leading-relaxed">{w}</p>
            ))}
          </div>
        )}

        {health && health.warnings.length === 0 && report && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-900/10 p-4 text-[12.5px] text-emerald-200/70">
            ✓ No health warnings detected.
          </div>
        )}

        {/* localStorage summary */}
        {ls && (
          <Section title="localStorage">
            <StatRow label="Total size" value={formatBytes(ls.totalBytes)} sub={`${ls.keyCount} keys`} />
            <StatRow label="Quota risk" value={health?.overQuotaRisk ? '⚠ Yes' : '✓ No'} />
            <StatRow label="Blob: URL values" value={String(ls.blobUrlCount)} />
            <StatRow label="Stale blob refs" value={String(ls.expiredBlobCount)}
              sub={ls.expiredBlobCount > 0 ? 'invalid after reload' : ''} />

            <h3 className="text-[10px] uppercase tracking-widest text-white/25 mt-5 mb-2">Largest keys</h3>
            <div className="space-y-1">
              {ls.topKeys.map((k) => (
                <div key={k.key} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-white/55 truncate max-w-xs">{k.key}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {k.looksLikeExpiredBlob && (
                      <Badge color="bg-red-900/40 text-red-300">stale blob</Badge>
                    )}
                    <span className="text-[11px] font-mono text-white/50">{formatBytes(k.bytes)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Stale blob refs detail */}
        {health && health.expiredBlobRefs.length > 0 && (
          <Section title="Stale blob: references">
            <p className="text-[12px] text-white/40 mb-3">
              These localStorage keys hold <code className="text-amber-300">blob:</code> URLs that became invalid
              when the page was last reloaded. They waste quota and should be cleaned up.
            </p>
            <div className="space-y-1">
              {health.expiredBlobRefs.map((key) => (
                <div key={key} className="font-mono text-[11px] text-rose-300/80 bg-rose-900/10 rounded px-2 py-1">
                  {key}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* IndexedDB summary */}
        {idb && (
          <Section title="IndexedDB">
            <StatRow
              label="Total storage (StorageManager)"
              value={idb.totalEstimatedBytes !== null ? formatBytes(idb.totalEstimatedBytes) : 'unavailable'}
            />
            <StatRow label="PDF records found" value={String(idb.pdfCount)} />
            <StatRow label="Databases" value={String(idb.databases.length)} />

            <h3 className="text-[10px] uppercase tracking-widest text-white/25 mt-5 mb-2">Databases</h3>
            {idb.databases.length === 0 ? (
              <p className="text-[11px] text-white/30 italic">No IndexedDB databases found.</p>
            ) : (
              <div className="space-y-1">
                {idb.databases.map((db) => (
                  <div key={db.name} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-white/55 truncate max-w-xs">{db.name}</span>
                    <span className="text-[11px] text-white/35">
                      {db.objectStoreCount !== null ? `${db.objectStoreCount} stores` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Raw JSON */}
        {report && (
          <Section title="Raw report JSON">
            <pre className="text-[10px] text-white/40 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(report, null, 2)}
            </pre>
          </Section>
        )}
      </div>
    </div>
  );
}
