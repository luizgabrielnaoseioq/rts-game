import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Spinner } from './components/common';
import { bootSession } from './lib/session';
import { ArmyScreen } from './screens/ArmyScreen';
import { LoginScreen, RegisterScreen } from './screens/AuthScreens';
import { ChestsScreen } from './screens/ChestsScreen';
import { CityScreen } from './screens/CityScreen';
import { GameLayout } from './screens/GameLayout';
import { MapScreen } from './screens/MapScreen';
import { RankingScreen } from './screens/RankingScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { useAuthStore } from './stores/auth';

let booted: Promise<void> | null = null;

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'booting')
    return (
      <div className="boot">
        <Spinner label="Reacendendo o Braseiro…" />
      </div>
    );
  if (status !== 'authenticated') return <Navigate to="/entrar" replace />;
  return <>{children}</>;
}

export function App() {
  useEffect(() => {
    booted ??= bootSession();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/entrar" element={<LoginScreen />} />
        <Route path="/cadastro" element={<RegisterScreen />} />
        <Route
          element={
            <RequireAuth>
              <GameLayout />
            </RequireAuth>
          }
        >
          <Route path="/cidade" element={<CityScreen />} />
          <Route path="/mapa" element={<MapScreen />} />
          <Route path="/exercito" element={<ArmyScreen />} />
          <Route path="/relatorios" element={<ReportsScreen />} />
          <Route path="/relatorios/:id" element={<ReportsScreen />} />
          <Route path="/baus" element={<ChestsScreen />} />
          <Route path="/ranking" element={<RankingScreen />} />
        </Route>
        <Route path="*" element={<Navigate to="/cidade" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
