import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '@/services/authService';

interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLogin: string;
  createdAt: string;
  updatedAt: string;
}

// Role-based permissions (matching backend)
const ROLE_PERMISSIONS = {
  viewer: {
    canView: ['dashboard', 'alarms', 'sites', 'reports', 'outage-reports', 'hourly-reports'],
    canEdit: [],
    canDelete: [],
    canManageUsers: false,
    canManageSettings: false
  },
  operator: {
    canView: ['dashboard', 'alarms', 'sites', 'reports', 'outage-reports', 'hourly-reports'],
    canEdit: ['alarms', 'sites'],
    canDelete: [],
    canManageUsers: false,
    canManageSettings: false
  },
  engineer: {
    canView: ['dashboard', 'alarms', 'sites', 'audit', 'tickets', 'reports', 'outage-reports', 'hourly-reports'],
    canEdit: ['alarms', 'sites'],
    canDelete: ['alarms', 'tickets'],
    canManageUsers: false,
    canManageSettings: true
  },
  admin: {
    canView: ['dashboard', 'alarms', 'sites', 'users', 'notifications', 'audit', 'settings', 'tickets', 'reports', 'outage-reports', 'hourly-reports'],
    canEdit: ['alarms', 'sites', 'users', 'settings', 'tickets'],
    canDelete: ['alarms', 'sites', 'users', 'tickets'],
    canManageUsers: true,
    canManageSettings: true
  }
};

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
  canView: (view: string) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const defaultAuthContext: AuthContextType = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  hasPermission: () => false,
  canView: () => false,
  login: async () => {},
  logout: () => {}
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (token) {
          const userData = await authService.getCurrentUser(token);
          setUser(userData);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('authToken');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const { token, user } = await authService.login(username, password);
      localStorage.setItem('authToken', token);
      setUser(user);
      navigate('/');
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    navigate('/login');
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    const role = user.role.toLowerCase();
    const permissions = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS];
    return permissions ? permissions.canEdit.includes(permission) : false;
  };

  const canView = (view: string): boolean => {
    if (!user) return false;
    const role = user.role.toLowerCase();
    const permissions = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS];
    return permissions ? permissions.canView.includes(view) : false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        hasPermission,
        canView,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Export useAuth hook for external use
export const useAuth = () => useContext(AuthContext);
