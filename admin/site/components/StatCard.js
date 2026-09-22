// A single-stat display card. Used on the dashboard.

export function StatCard({ label, value, hint, href }) {
  const content = (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '20px 24px',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          marginTop: 8,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {hint ? (
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            marginTop: 8,
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <a href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {content}
      </a>
    );
  }

  return content;
}