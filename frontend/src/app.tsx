import {
  CalendarDays,
  Layers,
  LayoutDashboard,
  Pill,
  Settings2,
  Stethoscope,
  Utensils,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { CombosPage } from './combos';
import { AppShell, type NavItem } from './components/layout/app-shell';
import { EmptyState } from './components/ui/empty-state';
import { Toaster } from './components/ui/sonner';
import { DailyPage, TodayRedirect } from './daily';
import { FoodsPage } from './foods';
import { goalSettingsPath } from './goal-text';
import { GoalsSettings } from './goals';
import { type Health, healthText } from './health';
import { medicationsPagePath } from './med-text';
import { MedicationsPage } from './medications';
import { ReportPage } from './report';
import { visitsPagePath } from './visit-text';
import { VisitsPage } from './visits';

// Every page URL lives here (central docs/directory-rules.md).
const pages = {
  overview: '/',
  daily: '/daily',
  foods: '/foods',
  combos: '/combos',
  visits: visitsPagePath,
  medications: medicationsPagePath,
  settings: goalSettingsPath,
} as const;

// Main menu (LNB) items, in display order.
const nav: NavItem[] = [
  { to: pages.overview, label: '대시보드', icon: LayoutDashboard },
  { to: pages.daily, label: '하루 기록', icon: CalendarDays },
  { to: pages.foods, label: '음식', icon: Utensils },
  { to: pages.combos, label: '조합', icon: Layers },
  { to: pages.visits, label: '병원', icon: Stethoscope },
  { to: pages.medications, label: '약', icon: Pill },
  { to: pages.settings, label: '설정', icon: Settings2 },
];

// An app left open past midnight must not keep yesterday as "today".
const healthRefreshMs = 60_000;

function useHealth() {
  const [health, setHealth] = useState<Health>({ state: 'loading' });
  useEffect(() => {
    // A slow older response must not overwrite a newer one.
    let latest = 0;
    const check = () => {
      const request = ++latest;
      const report = (next: Health) => {
        if (request === latest) setHealth(next);
      };
      fetch('/api/health')
        .then(async (response) => {
          const data = (await response.json()) as { today?: string; error?: string };
          report(
            response.ok && data.today
              ? { state: 'ok', today: data.today }
              : { state: 'error', message: data.error ?? '서버 상태를 확인할 수 없습니다' },
          );
        })
        .catch(() => report({ state: 'error', message: '서버에 연결할 수 없습니다' }));
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    const timer = setInterval(check, healthRefreshMs);
    document.addEventListener('visibilitychange', checkWhenVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, []);
  return health;
}

function Page({
  title,
  description,
  health,
  children,
}: {
  title: string;
  description: string;
  health: Health;
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="page-title">{title}</h1>
        <p className="text-body text-muted-foreground">{description}</p>
        {health.state === 'error' ? (
          <p role="alert" className="text-body-sm text-destructive">
            {healthText(health)}
          </p>
        ) : (
          <p role="status" className="text-caption text-muted-foreground">
            {healthText(health)}
          </p>
        )}
      </header>
      {children ?? (
        <EmptyState
          title="아직 기능이 없습니다"
          description="기능은 GitHub 이슈 카드로 등록한 뒤 하나씩 추가합니다."
        />
      )}
    </section>
  );
}

export function App() {
  const health = useHealth();
  // Pages that start a record on today: undefined while asking, null when the server cannot say.
  const pageToday =
    health.state === 'ok' ? health.today : health.state === 'loading' ? undefined : null;
  return (
    <BrowserRouter>
      <AppShell appName="식단·수면·건강 기록" nav={nav}>
        <Routes>
          <Route path={pages.overview} element={<ReportPage health={health} />} />
          <Route
            path={pages.daily}
            element={<TodayRedirect basePath={pages.daily} health={health} />}
          />
          <Route
            path={`${pages.daily}/:date`}
            element={<DailyPage basePath={pages.daily} health={health} />}
          />
          <Route path={pages.foods} element={<FoodsPage />} />
          <Route path={pages.combos} element={<CombosPage />} />
          <Route path={pages.visits} element={<VisitsPage today={pageToday} />} />
          <Route path={pages.medications} element={<MedicationsPage today={pageToday} />} />
          <Route
            path={pages.settings}
            element={
              <Page title="설정" description="앱 환경과 데이터 관리" health={health}>
                <GoalsSettings />
              </Page>
            }
          />
          <Route path="*" element={<Navigate to={pages.overview} replace />} />
        </Routes>
      </AppShell>
      <Toaster />
    </BrowserRouter>
  );
}
