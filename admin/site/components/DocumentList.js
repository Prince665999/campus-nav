// A table of uploaded knowledge documents.

'use client';

import { formatDateTime } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';

export function DocumentList({ documents, onDelete }) {
  if (!documents || documents.length === 0) {
    return (
      <div className="empty-state">
        No documents uploaded yet. Upload a PDF or text file above to
        start building the knowledge base.
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr
            style={{
              background: 'var(--border-subtle)',
              textAlign: 'left',
              fontSize: 13,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            <th style={{ padding: '12px 16px', fontWeight: 600 }}>File</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, width: 100 }}>
              Size
            </th>
            <th style={{ padding: '12px 16px', fontWeight: 600, width: 100 }}>
              Chunks
            </th>
            <th style={{ padding: '12px 16px', fontWeight: 600, width: 120 }}>
              Status
            </th>
            <th style={{ padding: '12px 16px', fontWeight: 600, width: 180 }}>
              Uploaded
            </th>
            <th style={{ padding: '12px 16px', fontWeight: 600, width: 90 }}>
              {' '}
            </th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr
              key={doc.id}
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <td style={{ padding: '12px 16px' }}>
                <div style={{ fontWeight: 500 }}>{doc.filename}</div>
                {doc.error_message ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--danger)',
                      marginTop: 4,
                    }}
                  >
                    {doc.error_message}
                  </div>
                ) : null}
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                {formatBytes(doc.size_bytes)}
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>
                {doc.chunk_count}
              </td>
              <td style={{ padding: '12px 16px' }}>
                <StatusBadge status={doc.status} />
              </td>
              <td
                style={{
                  padding: '12px 16px',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                }}
              >
                {formatDateTime(doc.created_at)}
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => onDelete(doc)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}