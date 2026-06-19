/**
 * Auth context. Holds the logged-in user, exposes login/logout, and validates a
 * persisted token on load via /me. Wires the API client's token + 401 handler.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as api from './api';
import type { AuthUser } from './api';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => undefined,
  logout: () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    api.setAuthToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: u } = await api.login(email, password);
    api.setAuthToken(token);
    setUser(u);
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      api.setAuthToken(null);
      setUser(null);
    });
  }, []);

  // Validate any persisted token on first load.
  useEffect(() => {
    let active = true;
    const token = api.getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    api
      .getMe()
      .then((u) => {
        if (active) setUser(u);
      })
      .catch(() => {
        api.setAuthToken(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
