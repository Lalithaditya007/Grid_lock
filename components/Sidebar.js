'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/',                    icon: '🏠', label: 'Command Center' },
  { href: '/log-event',           icon: '📍', label: 'Event Intake', highlight: true },
  { href: '/traffic-intelligence',icon: '🚦', label: 'Traffic Intelligence' },
  { href: '/hotspots',            icon: '🗺️', label: 'Hotspots & Maps' },
  { href: '/resources',           icon: '👮', label: 'Resource Planning' },
  { href: '/diversion',           icon: '🔀', label: 'Diversion Planner' },
  { href: '/insights',            icon: '📈', label: 'Insights & Learning' },
  { href: '/events',              icon: '📋', label: 'Event Table' },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <h1>Grid<span>Lock</span> AI</h1>
        <p>Predict. Prepare. Prevent.</p>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Navigation</div>
        {NAV.map(n => (
          <Link
            key={n.href}
            href={n.href}
            className={`nav-link${path === n.href ? ' active' : ''}${n.highlight && path !== n.href ? ' highlight-green' : ''}`}
          >
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </Link>
        ))}
      </nav>

      {/* Footer — no dataset info per spec */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-title">
          <span className="live-dot" />Live Operations Center
        </div>
        <div className="sidebar-footer-sub">AI-Powered Traffic Intelligence</div>
      </div>
    </aside>
  );
}
