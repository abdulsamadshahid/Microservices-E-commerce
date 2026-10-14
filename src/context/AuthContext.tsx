import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types/index.js';
import { api } from '../services/api.js';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, name: string) => Promise<void>;
  logout: () => void;
  loginDemo: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('shopsphere_jwt'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const profile = await api.getMe(token);
        setUser(profile);
      } catch {
        localStorage.removeItem('shopsphere_jwt');
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();
  }, [token]);

  const login = async (email: string, pass: string) => {
    const data = await api.login(email, pass);
    localStorage.setItem('shopsphere_jwt', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (email: string, pass: string, name: string) => {
    const data = await api.register(email, pass, name);
    localStorage.setItem('shopsphere_jwt', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('shopsphere_jwt');
    setToken(null);
    setUser(null);
  };

  const loginDemo = async (email: string) => {
    await login(email, 'password123');
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, loginDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
