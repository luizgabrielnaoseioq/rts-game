import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ConfigMismatchBanner, IncomingAttackBanner, Toasts } from '../components/Overlays';
import { TopBar } from '../components/TopBar';
import { Icon, type IconName } from '../components/icons';
import { PhaserHost } from '../game/PhaserHost';
import { useGameStore } from '../stores/game';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/cidade', label: 'Cidade', icon: 'keep' },
  { to: '/mapa', label: 'Mapa', icon: 'map' },
  { to: '/exercito', label: 'Exército', icon: 'barracks' },
  { to: '/relatorios', label: 'Relatórios', icon: 'scroll' },
  { to: '/baus', label: 'Baús', icon: 'chest' },
  { to: '/ranking', label: 'Ranking', icon: 'crown' },
];

function NavBadge({ to }: { to: string }) {
  const unread = useGameStore((s) => s.reports.filter((r) => !r.readAt).length);
  const chests = useGameStore((s) => s.chests.length + (s.daily?.available ? 1 : 0));
  const n = to === '/relatorios' ? unread : to === '/baus' ? chests : 0;
  return n > 0 ? <span className="nav-badge">{n > 99 ? '99+' : n}</span> : null;
}

/** Layout autenticado: barra de recursos, navegação lateral, Phaser sempre montado. */
export function GameLayout() {
  const { pathname } = useLocation();
  const onMap = pathname.startsWith('/mapa');
  return (
    <div className="game-layout">
      <TopBar />
      <ConfigMismatchBanner />
      <IncomingAttackBanner />
      <div className="game-body">
        <nav className="side-nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Icon name={n.icon} size={22} />
              <span>{n.label}</span>
              <NavBadge to={n.to} />
            </NavLink>
          ))}
        </nav>
        <main className={`game-main${onMap ? ' on-map' : ''}`}>
          <PhaserHost active={onMap} />
          <div className="screen">
            <Outlet />
          </div>
        </main>
      </div>
      <Toasts />
    </div>
  );
}
