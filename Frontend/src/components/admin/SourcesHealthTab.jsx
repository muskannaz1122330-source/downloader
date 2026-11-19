import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, AlertTriangle, CircleDashed } from 'lucide-react';
import { UltraApi } from '../../services/apiClient';

const STATUS_STYLES = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  degraded: 'bg-amber-50 text-amber-700 border-amber-200',
  failing: 'bg-rose-50 text-rose-700 border-rose-200',
  blocked_drm: 'bg-slate-100 text-slate-600 border-slate-200',
  unverified: 'bg-slate-50 text-slate-500 border-slate-200',
};

export function SourcesHealthTab({ showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setData(await UltraApi.getSourcesHealth());
    } catch (err) {
      showToast?.(err?.message || 'Could not load source health.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    if (!data?.sources) return [];
    return data.sources.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      if (query && !`${s.displayName} ${s.sourceId} ${s.adapter}`.toLowerCase().includes(query.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [data, filter, query]);

  return (
    <section className="space-y-6" aria-label="Sources health">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Sources Health</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {data?.note ||
              'A catalogue entry is not a verified extractor. Only sources with real successful analysis attempts are labelled verified.'}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Catalogue entries', value: data?.catalogueSize ?? '—', icon: CircleDashed },
          { label: 'Verified by real attempts', value: data?.verifiedCount ?? '—', icon: ShieldCheck },
          { label: 'Unverified', value: data?.unverifiedCount ?? '—', icon: AlertTriangle },
          { label: 'DRM blocked', value: data?.blockedDrmCount ?? '—', icon: AlertTriangle },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Icon size={14} /> {label}
            </div>
            <div className="mt-2 text-3xl font-extrabold tabular-nums text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {['all', 'verified', 'degraded', 'failing', 'unverified', 'blocked_drm'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
              filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search source or adapter…"
          aria-label="Search sources"
          className="ml-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm md:w-64"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Adapter / tier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Success</th>
              <th className="px-4 py-3">p95</th>
              <th className="px-4 py-3">Last verified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.sourceId} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <div className="font-semibold text-slate-800">{s.displayName}</div>
                  <div className="text-xs text-slate-400">{s.sourceId}</div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="text-slate-700">{s.adapter}</div>
                  <div className="text-xs text-slate-400">{s.tier}</div>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[s.status] || STATUS_STYLES.unverified}`}>
                    {s.status}
                  </span>
                  {s.lastFailureReason && (
                    <div className="mt-1 text-xs text-rose-500">{s.lastFailureReason}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-600">{s.attempts}</td>
                <td className="px-4 py-2.5 tabular-nums text-slate-600">
                  {s.successRate === null ? '—' : `${Math.round(s.successRate * 100)}%`}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-600">
                  {s.p95Ms === null ? '—' : `${s.p95Ms} ms`}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">
                  {s.lastVerifiedAt ? new Date(s.lastVerifiedAt).toLocaleString() : 'never'}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No sources match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.generatedAt && (
        <p className="text-xs text-slate-400">
          Snapshot: {new Date(data.generatedAt).toLocaleString()} · telemetry is in-memory and
          resets on restart.
        </p>
      )}
    </section>
  );
}
