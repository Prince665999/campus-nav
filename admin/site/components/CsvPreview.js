// A compact table showing the first N rows of a parsed CSV, so the
// admin can eyeball the data before confirming the import.

export function CsvPreview({ rows, columns, maxRows = 20 }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        No rows to preview.
      </div>
    );
  }

  const shown = rows.slice(0, maxRows);
  const remaining = rows.length - shown.length;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'auto',
        maxHeight: 400,
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
        }}
      >
        <thead>
          <tr
            style={{
              background: 'var(--border-subtle)',
              textAlign: 'left',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'var(--text-muted)',
            }}
          >
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  padding: '8px 12px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr
              key={i}
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              {columns.map((col) => (
                <td
                  key={col}
                  style={{
                    padding: '8px 12px',
                    whiteSpace: 'nowrap',
                    color: 'var(--text)',
                  }}
                >
                  {row[col] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {remaining > 0 ? (
        <div
          style={{
            padding: '10px 12px',
            fontSize: 12,
            color: 'var(--text-faint)',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          …and {remaining} more row{remaining === 1 ? '' : 's'}.
        </div>
      ) : null}
    </div>
  );
}