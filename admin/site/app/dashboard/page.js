// Admin dashboard. The landing page after login.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { api } from '@/lib/api';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { formatRelative } from '@/lib/format';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [recentReports, setRecentReports] = useState([]);
  const [healthChecks, setHealthChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statsData, reportsData, healthData] = await Promise.all([
          api.getStats(),
          api.listReports({ limit: 5 }),
          api.getMapHealth(),
        ]);
        if (!cancelled) {
          setStats(statsData);
          setRecentReports(reportsData);
          setHealthChecks(healthData.checks || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="loading">Loading dashboard…</div>;
  }

  if (error) {
    return <div className="error-box">{error}</div>;
  }

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">
        A quick view of the campus map and student feedback.
      </p>

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <StatCard
          label="Places"
          value={stats.place_count}
          href="/place-editor"
        />
        <StatCard label="Areas" value={stats.area_count} />
        <StatCard
          label="Paths"
          value={stats.edge_count}
          hint="routable edges"
        />
        <StatCard
          label="Photos"
          value={stats.media_count}
          href="/photo-manager"
        />
      </div>

      {/* Reports summary */}
      <div style={{ marginBottom: 32 }}>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Reports</h2>
          <Link href="/report-queue" style={{ fontSize: 14 }}>
            View all →
          </Link>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            marginBottom: 16,
          }}
        >
          <StatCard
            label="New"
            value={stats.reports_new}
            href="/report-queue?status=new"
          />
          <StatCard
            label="In progress"
            value={stats.reports_in_progress}
            href="/report-queue?status=in_progress"
          />
          <StatCard
            label="Resolved"
            value={stats.reports_resolved}
            href="/report-queue?status=resolved"
          />
        </div>

        {recentReports.length > 0 ? (
          <div className="card">
            <h3 className="card-title">Latest reports</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recentReports.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: 12,
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      {r.kind.replace('_', ' ')}
                      {r.place_name ? ` — ${r.place_name}` : ''}
                    </div>
                    <div
                      className="faint"
                      style={{ fontSize: 13, marginTop: 2 }}
                    >
                      {formatRelative(r.created_at)}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No reports yet.
            </p>
          </div>
        )}
      </div>

      {/* Map health summary */}
      <div>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Map health</h2>
          <Link href="/map-health" style={{ fontSize: 14 }}>
            See details →
          </Link>
        </div>

        <div className="card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {healthChecks.map((check) => (
              <div
                key={check.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{check.label}</span>
                {check.count === 0 ? (
                  <StatusBadge status="ok">All good</StatusBadge>
                ) : (
                  <span className="muted" style={{ fontSize: 14 }}>
                    {check.count} to review
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}