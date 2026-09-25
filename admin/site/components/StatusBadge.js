// A small coloured badge for status values.

const VARIANTS = {
  new: { bg: 'var(--info-bg)', color: 'var(--primary)' },
  in_progress: { bg: 'var(--warning-bg)', color: 'var(--warning)' },
  resolved: { bg: 'var(--success-bg)', color: 'var(--success)' },
  ok: { bg: 'var(--success-bg)', color: 'var(--success)' },
  warning: { bg: 'var(--warning-bg)', color: 'var(--warning)' },
  error: { bg: 'var(--danger-bg)', color: 'var(--danger)' },
  // Knowledge document statuses:
  processing: { bg: 'var(--info-bg)', color: 'var(--primary)' },
  ready: { bg: 'var(--success-bg)', color: 'var(--success)' },
  failed: { bg: 'var(--danger-bg)', color: 'var(--danger)' },
};

export function StatusBadge({ status, children }) {
  const variant = VARIANTS[status] || VARIANTS.ok;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: variant.bg,
        color: variant.color,
        textTransform: 'capitalize',
      }}
    >
      {children || status.replace('_', ' ')}
    </span>
  );
}