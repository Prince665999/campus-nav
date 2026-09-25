// Sidebar navigation.

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/map-health', label: 'Map Health', icon: 'health' },
  { href: '/report-queue', label: 'Reports', icon: 'flag' },
  { href: '/photo-manager', label: 'Photos', icon: 'camera' },
  { href: '/place-editor', label: 'Places', icon: 'pin' },
  { href: '/knowledge', label: 'Knowledge', icon: 'book' },
  { href: '/route-tester', label: 'Route Tester', icon: 'compass' },
  { href: '/reimport-view', label: 'Re-import', icon: 'refresh' },
  { href: '/roles', label: 'Roles', icon: 'people' },
];

function Icon({ name }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  switch (name) {
    case 'dashboard':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      );
    case 'health':
      return (
        <svg {...common}>
          <path d="M3 12h4l2-6 4 12 2-6h6" />
        </svg>
      );
    case 'flag':
      return (
        <svg {...common}>
          <path d="M4 22V4h12l-2 4 2 4H4" />
          <line x1="4" y1="22" x2="4" y2="4" />
        </svg>
      );
    case 'camera':
      return (
        <svg {...common}>
          <path d="M4 8h3l2-3h6l2 3h3v10H4z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      );
    case 'pin':
      return (
        <svg {...common}>
          <path d="M12 22s7-6 7-12a7 7 0 10-14 0c0 6 7 12 7 12z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case 'book':
      return (
        <svg {...common}>
          <path d="M4 4h8a4 4 0 014 4v12H8a4 4 0 00-4-4z" />
          <path d="M20 4h-8a4 4 0 00-4 4v12h8a4 4 0 014-4z" />
        </svg>
      );
    case 'compass':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <polygon points="15 9 13 13 9 15 11 11 15 9" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 0115-6.7L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 01-15 6.7L3 16" />
          <path d="M3 21v-5h5" />
        </svg>
      );
    case 'people':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 21v-2a6 6 0 016-6h0a6 6 0 016 6v2" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M16 21v-1a4 4 0 014-4h0a4 4 0 014 4v1" />
        </svg>
      );
    default:
      return null;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      router.push('/login');
    } catch {
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
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
          Admin
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
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
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                }}
              >
                <Icon name={item.icon} />
              </span>
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