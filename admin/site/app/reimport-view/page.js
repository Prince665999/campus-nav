// Re-import view. Shows what a re-import would change, and lets the
// admin run it.

'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { DiffViewer } from '@/components/DiffViewer';
import { formatRelative } from '@/lib/format';

export default function ReimportViewPage() {
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  async function loadDiff() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getReimportDiff();
      setDiff(data);
      setLastChecked(new Date().toISOString());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDiff();
  }, []);

  async function runReimport() {
    if (
      !confirm(
        'Run the re-import? This updates OSM-sourced fields from map.osm. ' +
          'Hand-edited descriptions, photos, and aliases are not touched.'
      )
    ) {
      return;
    }

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const data = await api.runReimport();
      setResult(data);
      // Reload the diff to show the new state.
      await loadDiff();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Re-import</h1>
      <p className="page-subtitle">
        Update the database from map.osm. Merge-safe — nothing you've
        added by hand in the admin gets overwritten.
      </p>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="row-between">
          <div>
            <div style={{ fontWeight: 600 }}>Current diff</div>
            <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>
              {lastChecked
                ? `Checked ${formatRelative(lastChecked)}`
                : 'Checking…'}
            </div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={loadDiff}
            disabled={loading || running}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Computing diff…</div>
      ) : diff ? (
        <>
          <DiffViewer diff={diff} />

          <div className="card" style={{ marginTop: 24 }}>
            <h3 className="card-title">Run the re-import</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
              Applies the changes shown above to the database. Existing
              photos, hand-written descriptions, and any fields not
              present in map.osm are preserved.
            </p>
            <button
              className="btn"
              onClick={runReimport}
              disabled={running}
            >
              {running ? 'Re-importing…' : 'Run re-import'}
            </button>

            {result ? (
              <div className="success-box" style={{ marginTop: 20 }}>
                <strong>Re-import complete.</strong>
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  {result.places_added} places added,{' '}
                  {result.places_updated} updated,{' '}
                  {result.areas_added} areas added,{' '}
                  {result.areas_updated} updated,{' '}
                  {result.edges_added} edges added,{' '}
                  {result.edges_updated} updated.
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}