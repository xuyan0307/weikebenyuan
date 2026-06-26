import { useState, useEffect, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { api, getToken, setToken } from '../api/client';
import { authApi } from '../api/endpoints';
import type { UserInfo } from '../api/endpoints';

type Role = 'superadmin' | 'admin' | 'service' | 'therapist' | 'finance';

interface AppContextValue {
  currentUser: UserInfo;
  setCurrentUser: (u: UserInfo | null) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  activePage: string;
  setActivePage: (p: string) => void;
  notifications: number;
  loading: boolean;
  logout: () => void;
}

const AppContext = createContext<AppContextValue>({
  currentUser: null,
  setCurrentUser: () => {},
  sidebarCollapsed: false,
  setSidebarCollapsed: () => {},
  activePage: 'dashboard',
  setActivePage: () => {},
  notifications: 0,
  loading: true,
  logout: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      window.location.href = '/login';
      return;
    }
    authApi.me()
      .then((r) => setCurrentUser(r.user))
      .catch(() => {
        setToken(null);
        window.location.href = '/login';
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = () => {
    setToken(null);
    setCurrentUser(null);
    window.location.href = '/login';
  };

  if (loading || !currentUser) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#1E88E5' }}>
        加载中...
      </div>
    );
  }

  return (
    <AppContext.Provider value={{
      currentUser,
      setCurrentUser,
      sidebarCollapsed,
      setSidebarCollapsed,
      activePage,
      setActivePage,
      notifications: 5,
      loading,
      logout,
    } as AppContextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

export function hasPermission(role: Role | string | undefined, module: string): boolean {
  if (!role) return false;
  const perms: Record<string, string[]> = {
    superadmin: ['dashboard', 'customers', 'orders', 'appointments', 'services', 'therapists', 'finance', 'accounts', 'reports', 'settings'],
    admin: ['dashboard', 'customers', 'orders', 'appointments', 'services', 'therapists', 'finance', 'reports', 'settings'],
    service: ['dashboard', 'customers', 'orders', 'appointments', 'services'],
    therapist: ['dashboard', 'appointments', 'services', 'profile', 'salary'],
    finance: ['dashboard', 'orders', 'finance'],
  };
  return (perms[role] ?? []).includes(module);
}

// 兼容旧导入：api 重新导出
export { api };
