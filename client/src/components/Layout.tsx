import { NavLink, Outlet } from 'react-router-dom';
import { AS_OF_DATE, SEED, TARGET_TERM } from '@yottaflex/shared';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/forecasts', label: 'Forecast' },
  { to: '/allocation', label: 'Allocation' },
  { to: '/exceptions', label: 'Exceptions' },
  { to: '/explorer', label: 'Data Explorer' },
  { to: '/reproducibility', label: 'Reproducibility' },
  { to: '/schema', label: 'Schema' },
];

export function Layout() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">YF</span>
          <div>
            <strong>YottaFlex</strong>
            <span>Course demand &amp; allocation</span>
          </div>
        </div>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-meta">
          <div>
            <span>Seed</span>
            <strong>{SEED}</strong>
          </div>
          <div>
            <span>Target term</span>
            <strong>{TARGET_TERM}</strong>
          </div>
          <div>
            <span>As of</span>
            <strong>{AS_OF_DATE}</strong>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div>
            <p className="eyebrow">Read-only analytics workspace</p>
            <h1>Course Demand &amp; Faculty Allocation</h1>
          </div>
          <div className="topbar-pill">Deterministic seed {SEED}</div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
