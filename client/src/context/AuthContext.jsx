import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, companyStore } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyIdState] = useState(companyStore.get());
  const [mode, setMode] = useState('desktop');
  const [capabilities, setCapabilities] = useState([]);

  const load = async () => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    try {
      const data = await api('/auth/me');
      setUser(data.user);
      setCompanies(data.companies || []);
      setMode(data.mode || 'desktop');
      setCapabilities(data.capabilities || []);
      if (!companyStore.get() && data.companies?.length) {
        companyStore.set(data.companies[0].id);
        setCompanyIdState(data.companies[0].id);
      }
    } catch (err) {
      if (err.code === 'AUTH_REQUIRED') {
        tokenStore.clear();
        companyStore.clear();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onUnauthorized = () => { tokenStore.clear(); setUser(null); window.location.href = '/login'; };
    window.addEventListener('bahi:unauthorized', onUnauthorized);
    return () => window.removeEventListener('bahi:unauthorized', onUnauthorized);
  }, []);

  const login = async (username, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { username, password } });
    tokenStore.set(data.token);
    setUser(data.user);
    setCompanies(data.companies || []);
    setMode(data.mode || 'desktop');
    setCapabilities(data.capabilities || []);
    if (data.companies?.[0]) {
      companyStore.set(data.companies[0].id);
      setCompanyIdState(data.companies[0].id);
    } else {
      companyStore.clear();
      setCompanyIdState('');
    }
    return data;
  };

  const logout = () => {
    tokenStore.clear();
    companyStore.clear();
    setUser(null);
    setCompanies([]);
    setCompanyIdState('');
    setCapabilities([]);
  };

  const setCompanyId = (id) => {
    companyStore.set(id);
    setCompanyIdState(id);
  };

  const hasCap = (cap) => capabilities.includes(cap);
  const isWeb = mode === 'web';
  const isDesktop = mode === 'desktop';

  const value = useMemo(() => ({
    loading, user, companies, companyId, mode, capabilities, hasCap, isWeb, isDesktop,
    login, logout, setCompanyId, refresh: load,
  }), [loading, user, companies, companyId, mode, capabilities]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
