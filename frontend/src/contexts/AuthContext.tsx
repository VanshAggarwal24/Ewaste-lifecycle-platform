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
  const [user, setUser] = useState<User | null>(() => {
    const token = localStorage.getItem('token');
    const role  = localStorage.getItem('role');
    const name  = localStorage.getItem('name');
    const email = localStorage.getItem('email');
    const userId = localStorage.getItem('userId');
    if (token && role && name && userId) {
      return { token, role, name, email: email || '', userId };
    }
    return null;
  });

  const login = (data: Partial<User> & { token: string; role: string; name: string; userId: string; email?: string }) => {
    const userObj: User = {
      token: data.token,
      role: data.role,
      name: data.name,
      userId: data.userId,
      email: data.email || '',
    };
    localStorage.setItem('token',  userObj.token);
    localStorage.setItem('role',   userObj.role);
    localStorage.setItem('name',   userObj.name);
    localStorage.setItem('email',  userObj.email);
    localStorage.setItem('userId', userObj.userId);
    setUser(userObj);
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
