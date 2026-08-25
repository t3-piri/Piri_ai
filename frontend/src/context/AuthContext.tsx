import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet, apiPost, setAuthToken, setUnauthorizedHandler } from "@/lib/api";

export type AuthUser = {
  username: string;
  display_name: string;
  role: string;
  role_label: string;
  is_owner: boolean;
  permissions: string[];
  avatar_url: string | null;
};

export type Role = {
  key: string;
  label: string;
  description: string;
  permissions: string[];
  assignable: boolean;
};

const TOKEN_KEY = "piri_admin_token";

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string, remember: boolean) {
  try {
    if (remember) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* private-mode/blocked storage: session stays in-memory only */
  }
}

function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

type AuthContextValue = {
  user: AuthUser | null;
  roles: Role[];
  ready: boolean;
  login: (username: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  refreshMe: () => Promise<void>;
  setUser: (user: AuthUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [ready, setReady] = useState(false);

  const clearSession = useCallback(() => {
    setAuthToken(null);
    clearStoredToken();
    setUser(null);
    setRoles([]);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    const token = readStoredToken();
    if (!token) {
      setReady(true);
      return;
    }
    setAuthToken(token);
    apiGet("/api/admin/me")
      .then((data) => {
        setUser(data.user);
        setRoles(data.roles);
      })
      .catch(() => clearSession())
      .finally(() => setReady(true));
  }, [clearSession]);

  const login = useCallback(async (username: string, password: string, remember: boolean) => {
    const data = await apiPost("/api/admin/login", { username, password });
    setAuthToken(data.token);
    storeToken(data.token, remember);
    setUser(data.user);
    try {
      const me = await apiGet("/api/admin/me");
      setRoles(me.roles);
    } catch {
      /* roles catalog is a nice-to-have; login already returned the user payload */
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost("/api/admin/logout");
    } catch {
      /* token may already be invalid/expired server-side; clean up locally regardless */
    }
    clearSession();
  }, [clearSession]);

  const refreshMe = useCallback(async () => {
    const data = await apiGet("/api/admin/me");
    setUser(data.user);
    setRoles(data.roles);
  }, []);

  const can = useCallback((permission: string) => !!user && user.permissions.includes(permission), [user]);

  const value = useMemo(
    () => ({ user, roles, ready, login, logout, can, refreshMe, setUser }),
    [user, roles, ready, login, logout, can, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
