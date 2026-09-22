// A compact display of a re-import diff.

export function DiffViewer({ diff }) {
  if (!diff) return null;

  const rows = [
    { label: 'Places', added: diff.places_added, updated: diff.places_updated, unchanged: diff.places_unchanged },
    { label: 'Areas', added: diff.areas_added, updated: diff.areas_updated, unchanged: diff.areas_unchanged },
    { label: 'Paths', added: diff.edges_added, updated: diff.edges_updated, unchanged: diff.edges_unchanged },
  ];

  return (
    <div className="card">
      <h3 className="card-title">What would change</h3>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            <th style={{ textAlign: 'left', padding: '6px 0' }}></th>
            <th style={{ textAlign: 'right', padding: '6px 0', width: 80 }}>Add</th>
            <th style={{ textAlign: 'right', padding: '6px 0', width: 80 }}>Update</th>
            <th style={{ textAlign: 'right', padding: '6px 0', width: 100 }}>Unchanged</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <td style={{ padding: '10px 0', fontWeight: 500 }}>{row.label}</td>
              <td
                style={{
                  padding: '10px 0',
                  textAlign: 'right',
                  color: row.added > 0 ? 'var(--success)' : 'var(--text-faint)',
                  fontWeight: row.added > 0 ? 600 : 400,
                }}
              >
                {row.added > 0 ? `+${row.added}` : '—'}
              </td>
              <td
                style={{
                  padding: '10px 0',
                  textAlign: 'right',
                  color: row.updated > 0 ? 'var(--warning)' : 'var(--text-faint)',
                  fontWeight: row.updated > 0 ? 600 : 400,
                }}
              >
                {row.updated > 0 ? `~${row.updated}` : '—'}
              </td>
              <td
                style={{
                  padding: '10px 0',
                  textAlign: 'right',
                  color: 'var(--text-muted)',
                }}
              >
                {row.unchanged}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {diff.sample_changes && diff.sample_changes.length > 0 ? (
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div
            className="faint"
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 8,
            }}
          >
            Examples
          </div>
          <div className="mono" style={{ fontSize: 13, lineHeight: 1.8 }}>
            {diff.sample_changes.map((c, i) => (
              <div key={i}>
                <span
                  style={{
                    color:
                      c.type === 'place_add'
                        ? 'var(--success)'
                        : 'var(--warning)',
                  }}
                >
                  {c.type === 'place_add' ? 'add' : 'update'}
                </span>{' '}
                {c.name}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}