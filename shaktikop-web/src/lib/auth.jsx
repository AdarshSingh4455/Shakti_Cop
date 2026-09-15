import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as apiLib from './api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  // पेज दोबारा खुलने पर टोकन से सत्र वापस लाएं — अधिकारी को बार-बार लॉगिन न करना पड़े
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!apiLib.getToken()) { setLoading(false); return; }
      try {
        const me = await apiLib.fetchMe();
        if (!cancelled) setAdmin(me);
      } catch {
        apiLib.clearTokens();
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (username, password) => {
    const user = await apiLib.adminLogin(username, password);
    setAdmin(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    apiLib.clearTokens();
    setAdmin(null);
  }, []);

  const isSuperAdmin = admin?.adminRole === 'super_admin';
  const isMonitor = admin?.adminRole === 'monitor';

  return (
    <AuthCtx.Provider value={{ admin, loading, login, logout, isSuperAdmin, isMonitor }}>
      {children}
    </AuthCtx.Provider>
  );
}
