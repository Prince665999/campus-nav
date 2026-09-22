// Map health page. Shows the checks from Phase 11 in detail.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { api } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';

export default function MapHealthPage() {
  const [report, setReport] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getMapHealth()
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (key) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  if (loading) return <div className="loading">Running checks…</div>;
  if (error) return <div className="error-box">{error}</div>;

  return (
    <>
      <h1 className="page-title">Map Health</h1>
      <p className="page-subtitle">
        Informational checks on the map data. Nothing here blocks the app.
      </p>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="row-between">
          <div>
            <div className="faint" style={{ fontSize: 13, marginBottom: 4 }}>
              Total items to review
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>
              {report.total_issues}
            </div>
          </div>
          <div className="muted" style={{ maxWidth: 400, fontSize: 13 }}>
            These are tagged gaps, not errors. The app works fine with
            them. Fix them at your own pace.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {report.checks.map((check) => (
          <div key={check.key} className="card">
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>
                  {check.label}
                </div>
                <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
                  {check.description}
                </div>
              </div>
              {check.count === 0 ? (
                <StatusBadge status="ok">All good</StatusBadge>
              ) : (
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: 'var(--warning)',
                  }}
                >
                  {check.count}
                </div>
              )}
            </div>

            {check.count > 0 && check.items && check.items.length > 0 ? (
              <>
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: 8, fontSize: 13, padding: '6px 12px' }}
                  onClick={() => toggle(check.key)}
                >
                  {expanded[check.key] ? 'Hide examples' : 'Show examples'}
                </button>

                {expanded[check.key] ? (
                  <div
                    style={{
                      marginTop: 16,
                      paddingTop: 16,
                      borderTop: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      className="mono"
                      style={{ fontSize: 13, lineHeight: 1.8 }}
                    >
                      {check.items.map((item, i) => (
                        <div key={i}>
                          {typeof item === 'object'
                            ? Object.entries(item)
                                .map(([k, v]) => `${k}=${v}`)
                                .join('  ')
                            : item}
                        </div>
                      ))}
                    </div>
                    {check.count > check.items.length ? (
                      <div
                        className="faint"
                        style={{ fontSize: 12, marginTop: 12 }}
                      >
                        …and {check.count - check.items.length} more.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}