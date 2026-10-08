import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  userId: string;
  role: string;
  name: string;
  email: string;
  token: string;
}

interface AuthContextType {
  user: User | null;
  login: (data: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role  = localStorage.getItem('role');
    const name  = localStorage.getItem('name');
    const email = localStorage.getItem('email');
    const userId = localStorage.getItem('userId');
    if (token && role && name && userId && email) {
      setUser({ token, role, name, email, userId });
    }
  }, []);

  const login = (data: User) => {
    localStorage.setItem('token',  data.token);
    localStorage.setItem('role',   data.role);
    localStorage.setItem('name',   data.name);
    localStorage.setItem('email',  data.email);
    localStorage.setItem('userId', data.userId);
    setUser(data);
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
