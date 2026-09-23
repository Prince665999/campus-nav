// Sidebar navigation.

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/map-health', label: 'Map Health', icon: '🩺' },
  { href: '/report-queue', label: 'Reports', icon: '🚩' },
  { href: '/photo-manager', label: 'Photos', icon: '📷' },
  { href: '/place-editor', label: 'Places', icon: '📍' },
  { href: '/route-tester', label: 'Route Tester', icon: '🧭' },
  { href: '/reimport-view', label: 'Re-import', icon: '🔄' },
  { href: '/roles', label: 'Roles', icon: '👥' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      // Navigate anyway.
      router.push('/login');
    }
  }

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: 'var(--sidebar-width)',
        background: 'var(--bg-elevated)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 0',
      }}
    >
      <div style={{ padding: '0 24px', marginBottom: 32 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Campus Nav</div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            marginTop: 2,
          }}
        >
          Admin
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 24px',
                color: isActive ? 'var(--text)' : 'var(--text-muted)',
                background: isActive ? 'var(--border-subtle)' : 'transparent',
                borderLeft: isActive
                  ? '3px solid var(--primary)'
                  : '3px solid transparent',
                textDecoration: 'none',
                fontWeight: isActive ? 600 : 500,
              }}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: '0 24px' }}>
        <button
          className="btn btn-secondary"
          onClick={logout}
          style={{ width: '100%', fontSize: 14 }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}