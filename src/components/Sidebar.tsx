import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Shield, Settings, Users, Bell, FileText, MailIcon } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  const { user, logout, canView } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  // Define menu items with role-based visibility
  const menuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: '📊',
      visible: true // Everyone can see dashboard
    },
    {
      id: 'alarms',
      label: 'Alarms',
      icon: '🚨',
      visible: canView('alarms')
    },
    {
      id: 'sites',
      label: 'Sites',
      icon: '📡',
      visible: canView('sites')
    },
    {
      id: 'users',
      label: 'Users',
      icon: '👥',
      visible: canView('users')
    },
    {
      id: 'audit',
      label: 'Audit Log',
      icon: '📜',
      visible: isAdmin // Only show for admin users
    },
    {
      id: 'tickets',
      label: 'Tickets',
      icon: '🎫',
      visible: canView('tickets')
    },
    {
      id: 'outage-reports',
      label: 'Outage Reports',
      icon: '📋',
      visible: canView('outage-reports')
    },
    {
      id: 'hourly-reports',
      label: 'Hourly Reports',
      icon: '⏰',
      visible: canView('hourly-reports')
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: '📊',
      visible: canView('reports')
    },
      {
  id: 'email-management',
  label: 'Email Management',
  icon: '📋',
   visible: isAdmin
      
  },

];

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="flex flex-col h-full bg-sidebar-background text-sidebar-foreground w-64 border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 border-b border-sidebar-border">
        <h1 className="text-xl font-bold">NOC Alert System</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {menuItems
            .filter(item => item.visible)
            .map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onViewChange(item.id)}
                  className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${
                    activeView === item.id
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                >
                  <span className="mr-3 text-xl">{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              </li>
            ))}
        </ul>
      </nav>

      {/* User info, theme toggle, and logout */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-sidebar-foreground">{user?.username || 'User'}</p>
              <p className="text-xs text-muted-foreground">{user?.role || 'Guest'}</p>
            </div>
          </div>
          <div className="flex space-x-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowLogoutConfirm(true)}
              className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground text-center">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl border border-border">
            <h3 className="text-lg font-medium text-foreground mb-4">Confirm Logout</h3>
            <p className="text-muted-foreground mb-6">Are you sure you want to log out?</p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowLogoutConfirm(false)}
                className="text-foreground border-border hover:bg-accent"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleLogout}
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
