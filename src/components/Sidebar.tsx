import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Shield, Settings, Users, Bell, FileText } from 'lucide-react';

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
      id: 'notifications',
      label: 'Notifications',
      icon: '📧',
      visible: canView('notifications')
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
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
      visible: canView('settings')
    }
  ];

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white w-64 border-r border-gray-800">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 border-b border-gray-800">
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
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span className="mr-3 text-xl">{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              </li>
            ))}
        </ul>
      </nav>

      {/* User info and logout */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-white">{user?.name || 'User'}</p>
              <p className="text-xs text-gray-400">{user?.role || 'Guest'}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowLogoutConfirm(true)}
            className="text-gray-400 hover:text-white hover:bg-gray-800"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
            <h3 className="text-lg font-medium text-white mb-4">Confirm Logout</h3>
            <p className="text-gray-300 mb-6">Are you sure you want to log out?</p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowLogoutConfirm(false)}
                className="text-gray-300 border-gray-600 hover:bg-gray-700"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700"
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
