// Route tester. Pick two places, see the route, timeline, and narration.

'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { formatDistance, formatDuration } from '@/lib/format';

export default function RouteTesterPage() {
  const [places, setPlaces] = useState([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [route, setRoute] = useState(null);
  const [narration, setNarration] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .listPlaces({ limit: 200 })
      .then(setPlaces)
      .catch((err) => setError(err.message));
  }, []);

  async function run() {
    if (!fromId || !toId) return;
    if (fromId === toId) {
      setError('Pick two different places.');
      return;
    }

    setLoading(true);
    setError(null);
    setRoute(null);
    setNarration(null);

    try {
      const routeData = await api.computeRoute(fromId, toId);
      setRoute(routeData);

      // Narration in parallel; a failure here doesn't fail the whole test.
      try {
        const narrData = await api.narrateRoute(fromId, toId);
        setNarration(narrData);
      } catch {
        setNarration(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Route Tester</h1>
      <p className="page-subtitle">
        The same route and narration a student would see. Useful for
        checking that directions make sense before they go live.
      </p>

      <div className="card" style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto',
            gap: 16,
            alignItems: 'end',
          }}
        >
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">From</label>
            <select
              className="form-select"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
            >
              <option value="">Pick a place…</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">To</label>
            <select
              className="form-select"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
            >
              <option value="">Pick a place…</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn"
            onClick={run}
            disabled={!fromId || !toId || loading}
          >
            {loading ? 'Computing…' : 'Test route'}
          </button>
        </div>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      {route ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
              marginBottom: 24,
            }}
          >
            <SummaryBox label="Distance" value={formatDistance(route.distance_m)} />
            <SummaryBox
              label="Est. walking time"
              value={formatDuration(route.distance_m / 1.1)}
            />
            <SummaryBox label="Steps" value={route.steps.length} />
            <SummaryBox
              label="Geometry points"
              value={route.geometry.length}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <h3 className="card-title">Turn by turn</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {route.steps.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 12,
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    <span
                      className="faint mono"
                      style={{ minWidth: 60, flexShrink: 0 }}
                    >
                      {Math.round(step.at_m)}m
                    </span>
                    <span>{step.instruction}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3 className="card-title">Narration</h3>
              {narration && narration.text ? (
                <div style={{ fontSize: 15, lineHeight: 1.7 }}>
                  {narration.text}
                </div>
              ) : (
                <p className="faint" style={{ margin: 0 }}>
                  Narration isn't available for this route yet.
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

function SummaryBox({ label, value }) {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 16,
      }}
    >
      <div
        className="faint"
        style={{
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}