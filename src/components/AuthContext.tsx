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
    canView: ['dashboard', 'alarms'],
    canEdit: [],
    canDelete: [],
    canManageUsers: false,
    canManageSettings: false
  },
  operator: {
    canView: ['dashboard', 'alarms', 'devices', 'topology', 'tickets'],
    canEdit: ['alarms', 'tickets'],
    canDelete: ['alarms', 'tickets'],
    canManageUsers: false,
    canManageSettings: false
  },
  engineer: {
    canView: ['dashboard', 'alarms', 'devices', 'topology', 'users', 'audit', 'tickets'],
    canEdit: ['alarms', 'devices', 'tickets'],
    canDelete: ['alarms', 'tickets'],
    canManageUsers: false,
    canManageSettings: true
  },
  admin: {
    canView: ['dashboard', 'alarms', 'devices', 'topology', 'users', 'notifications', 'audit', 'settings', 'tickets'],
    canEdit: ['alarms', 'devices', 'users', 'settings', 'tickets'],
    canDelete: ['alarms', 'devices', 'users', 'tickets'],
    canManageUsers: true,
    canManageSettings: true
  }
};

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasPermission: (action: string, resource: string) => boolean;
  canView: (resource: string) => boolean;
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
  logout: () => {},
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in on app start
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (token) {
          const userData = await authService.getCurrentUser(token);
          setUser(userData);
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        localStorage.removeItem('authToken');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  const hasPermission = (action: string, resource: string): boolean => {
    if (!user) return false;

    const permissions = ROLE_PERMISSIONS[user.role as keyof typeof ROLE_PERMISSIONS];
    if (!permissions) return false;

    switch (action) {
      case 'view':
        return permissions.canView.includes(resource);
      case 'edit':
        return permissions.canEdit.includes(resource);
      case 'delete':
        return permissions.canDelete.includes(resource);
      case 'manageUsers':
        return permissions.canManageUsers;
      case 'manageSettings':
        return permissions.canManageSettings;
      default:
        return false;
    }
  };

  const canView = (resource: string): boolean => {
    return hasPermission('view', resource);
  };

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await authService.login(username, password);
      const { token, user: userData } = response;

      localStorage.setItem('authToken', token);
      setUser(userData);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    navigate('/login');
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    hasPermission,
    canView,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
