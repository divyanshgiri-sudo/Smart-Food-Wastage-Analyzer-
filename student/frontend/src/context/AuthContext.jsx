/**
 * Authentication context for student portal.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, cachedUser, SESSION_EXPIRED_EVENT, tokenStore } from '../services/api';

const AuthContext = createContext(null);

function decodeJwt(token) {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export function AuthProvider({ children }) {
  // Start from the cached profile or decoded JWT so a refresh does not flash the login page.
  const [user, setUser] = useState(() => {
    const raw = tokenStore.get() ? cachedUser.get() : null;
    const token = tokenStore.get();
    const decoded = decodeJwt(token);
    if (decoded) {
      return {
        ...raw,
        id: decoded.id || raw?.id,
        name: decoded.name || raw?.name,
        email: decoded.email || raw?.email,
        role: decoded.role || raw?.role,
        studentId: decoded.studentId || decoded.regNo || raw?.studentId || raw?.regNo,
        regNo: decoded.regNo || decoded.studentId || raw?.regNo || raw?.studentId,
        hostel: decoded.hostel || raw?.hostel,
      };
    }
    return raw;
  });
  // `bootstrapping` covers the token check on first load, so guarded routes do
  // not bounce a signed-in user to the login page during a refresh.
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const token = tokenStore.get();
      if (!token) {
        setBootstrapping(false);
        return;
      }
      try {
        const data = await authApi.me();
        if (!cancelled) {
          const decoded = decodeJwt(token);
          const merged = {
            ...data.user,
            studentId: data.user?.studentId || decoded?.studentId,
            regNo: data.user?.regNo || decoded?.regNo || data.user?.studentId || decoded?.studentId,
            hostel: data.user?.hostel || decoded?.hostel,
          };
          setUser(merged);
          cachedUser.set(merged);
        }
      } catch (error) {
        // Only a rejected token ends the session. A network failure means the
        // server is unreachable, which the pages report through their own
        // error states rather than by signing the student out.
        if (error.status === 401 || error.status === 403) {
          tokenStore.clear();
          localStorage.removeItem('token');
          if (!cancelled) setUser(null);
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Any rejected token anywhere in the app ends the session here.
  useEffect(() => {
    const handleExpiry = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpiry);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpiry);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password);
    tokenStore.set(data.token);
    cachedUser.set(data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const loginWithOtp = useCallback(async (email, otp, role) => {
    const data = await authApi.verifyOtp(email, otp, role);
    const decoded = decodeJwt(data.token);
    const userObj = {
      ...data.user,
      id: data.user?.id || decoded?.id,
      name: data.user?.name || decoded?.name,
      email: data.user?.email || decoded?.email,
      role: data.user?.role || decoded?.role,
      studentId: data.user?.studentId || decoded?.studentId,
      regNo: data.user?.regNo || decoded?.regNo || decoded?.studentId,
      hostel: data.user?.hostel || decoded?.hostel,
    };
    tokenStore.set(data.token);
    localStorage.setItem('token', data.token);
    cachedUser.set(userObj);
    localStorage.setItem('user', JSON.stringify(userObj));
    setUser(userObj);
    return userObj;
  }, []);

  const requestOtp = useCallback(async (email) => {
    return await authApi.requestOtp(email);
  }, []);

  const registerRequest = useCallback(async (details) => {
    return await authApi.registerRequest(details);
  }, []);

  const registerVerify = useCallback(async (email, otp) => {
    const data = await authApi.registerVerify(email, otp);
    const decoded = decodeJwt(data.token);
    const userObj = {
      ...data.user,
      id: data.user?.id || decoded?.id,
      name: data.user?.name || decoded?.name,
      email: data.user?.email || decoded?.email,
      role: data.user?.role || decoded?.role,
      studentId: data.user?.studentId || decoded?.studentId,
      regNo: data.user?.regNo || decoded?.regNo || decoded?.studentId,
      hostel: data.user?.hostel || decoded?.hostel,
    };
    tokenStore.set(data.token);
    localStorage.setItem('token', data.token);
    cachedUser.set(userObj);
    localStorage.setItem('user', JSON.stringify(userObj));
    setUser(userObj);
    return userObj;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Signing out locally must succeed even if the server is unreachable.
    }
    tokenStore.clear();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      role: user?.role ?? null,
      isAuthenticated: !!user,
      bootstrapping,
      login,
      loginWithOtp,
      requestOtp,
      registerRequest,
      registerVerify,
      logout,
    }),
    [user, bootstrapping, login, loginWithOtp, requestOtp, registerRequest, registerVerify, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
