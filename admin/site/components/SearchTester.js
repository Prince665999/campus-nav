// A retrieval tester. Type a query, see the chunks the knowledge base
// would return for it.
//
// Useful for debugging: when the chat gives a wrong answer, check
// what the retriever found for that question. If the chunks are
// irrelevant, the answer will be too.

'use client';

import { useState } from 'react';

export function SearchTester() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function run(e) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch(
        `/api/proxy/api/chat/doc/search?q=${encodeURIComponent(query)}&top_k=5`
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || `Search failed (${response.status})`);
      }
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 className="card-title">Test retrieval</h3>
      <p
        className="muted"
        style={{ marginTop: 0, marginBottom: 16, fontSize: 14 }}
      >
        Type a question and see which document chunks the chat would
        find. If these are wrong, the chat's answer will be wrong too.
      </p>

      <form onSubmit={run} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          className="form-input"
          placeholder="e.g. when are mid-semester exams"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error ? (
        <div className="error-box" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}

      {results !== null ? (
        results.length === 0 ? (
          <div
            className="muted"
            style={{ marginTop: 20, fontSize: 14 }}
          >
            No chunks found. Either the knowledge base is empty, or the
            query doesn't match anything in it.
          </div>
        ) : (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {results.map((r, i) => (
              <div
                key={i}
                style={{
                  padding: 12,
                  background: 'var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 14,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>
                    {r.source_file} · page {r.page_number}
                    {r.section_heading ? ` · ${r.section_heading}` : ''}
                  </span>
                  <span className="mono">
                    score {r.score.toFixed(3)}
                  </span>
                </div>
                <div>{r.text}</div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}