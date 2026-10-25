import { BarChart3, Bot, ClipboardList, LogOut, MonitorPlay, Plus, Settings2, ShieldCheck, UsersRound } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

const links = [
  { to: '/app', label: 'Command center', icon: BarChart3, end: true },
  { to: '/app/competitions', label: 'Competitions', icon: ClipboardList },
  { to: '/app/teams', label: 'Teams', icon: UsersRound },
  { to: '/app/displays', label: 'Displays', icon: MonitorPlay },
  { to: '/app/access', label: 'Access & security', icon: ShieldCheck },
  { to: '/app/settings', label: 'Settings', icon: Settings2 },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const title = location.pathname.includes('competitions/new') ? 'New competition' : location.pathname === '/app' ? 'Command center' : 'Competition workspace';

  return <div className="app-shell">
    <aside className="sidebar" aria-label="Primary navigation">
      <NavLink to="/app" className="brand"><span className="brand-mark"><Bot size={18}/></span><span className="word">Match<em>Forge</em></span></NavLink>
      <nav className="nav">{links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end}><Icon size={17}/>{label}</NavLink>)}</nav>
      <div className="side-bottom">
        <button className="button primary" onClick={() => navigate('/app/competitions/new')}><Plus size={16}/> New competition</button>
        <div className="account-card"><strong>{user?.email ?? 'Signed-in account'}</strong><span>Secure account session</span></div>
        <button className="button ghost small" onClick={() => void signOut()}><LogOut size={14}/> Sign out</button>
      </div>
    </aside>
    <main className="content">
      <header className="topbar"><div className="crumb"><span>MatchForge</span><span>/</span><strong>{title}</strong></div><div className="top-actions"><span className="connection"><span className="hide-sm">Secure sync</span></span><button className="button secondary small" onClick={() => navigate('/app/competitions/new')}><Plus size={15}/> <span className="hide-sm">New</span></button></div></header>
      <Outlet />
    </main>
  </div>;
}
