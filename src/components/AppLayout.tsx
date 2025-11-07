import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { MetricsCard } from './MetricsCard';
import { AlarmRow } from './AlarmRow';
import { DeviceCard } from './DeviceCard';
import { FilterPanel } from './FilterPanel';
import { AlarmModal } from './AlarmModal';
import { AlarmChart } from './AlarmChart';
import { UserManagement } from './UserManagement';
import { SitesManagement } from './SitesManagement';
import { NotificationSettings } from './NotificationSettings';
import { TicketManagement } from './TicketManagement';
import { Reports } from './Reports';
import { OutageReports } from './OutageReports';
import { HourlyOutageReports } from './HourlyOutageReports';
import { AuditLog } from './AuditLog';

import { alarmManagementService } from '../services/alarmManagementService';
import { Alarm, AlarmSeverity, SiteTransmission, Site } from '../types';

const deviceIcons = {
  router: 'https://d64gsuwffb70l.cloudfront.net/68f204b6a0d31832cb27a1a8_1760691438673_02eac526.webp',
  switch: 'https://d64gsuwffb70l.cloudfront.net/68f204b6a0d31832cb27a1a8_1760691439489_d6ed99da.webp',
  base_station: 'https://d64gsuwffb70l.cloudfront.net/68f204b6a0d31832cb27a1a8_1760691440192_bce8ea09.webp',
  firewall: 'https://d64gsuwffb70l.cloudfront.net/68f204b6a0d31832cb27a1a8_1760691440903_f22d1ff4.webp',
};

export default function AppLayout() {
  const { canView } = useAuth();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedAlarm, setSelectedAlarm] = useState<Alarm | null>(null);
  const [view, setView] = useState<string>('dashboard');
  const [selectedSeverity, setSelectedSeverity] = useState<AlarmSeverity | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]); // Today by default
  const [selectedHour, setSelectedHour] = useState<string>(new Date().getHours().toString()); // Current hour by default
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Fetch real alarms data
  useEffect(() => {
    const fetchAlarms = async () => {
      try {
        const fetchedAlarms = await alarmManagementService.getAllAlarms({
          limit: showAllHistory ? 1000 : 100,
          sortBy: 'timestamp',
          sortOrder: 'desc'
        });
        setAlarms(fetchedAlarms);
      } catch (error) {
        console.error('Error fetching alarms:', error);
        // Keep empty array for now, could show error message to user
      }
    };
    fetchAlarms();
  }, [showAllHistory]);

  const handleViewChange = (newView: string) => {
    // Check if user has permission to view this section
    if (canView(newView)) {
      setView(newView);
    } else {
      console.warn(`User does not have permission to view: ${newView}`);
      // Could show a toast notification here
    }
  };

  const handleAcknowledge = (id: string) => {
    setAlarms(prev => prev.map(alarm => 
      alarm.id === id ? { ...alarm, status: 'acknowledged' as const, acknowledgedBy: 'current.user', acknowledgedAt: new Date() } : alarm
    ));
  };

  const handleResolve = (id: string) => {
    setAlarms(prev => prev.map(alarm => 
      alarm.id === id ? { ...alarm, status: 'resolved' as const, resolvedAt: new Date() } : alarm
    ));
  };

  const filteredAlarms = useMemo(() => {
    return alarms.filter(alarm => {
      // Date filtering - only apply if not showing all history
      if (!showAllHistory && selectedDate) {
        const alarmDate = new Date(alarm.timestamp).toISOString().split('T')[0];
        if (alarmDate !== selectedDate) return false;
        
        // Hour filtering - only apply if specific hour is selected
        if (selectedHour !== 'all') {
          const alarmHour = new Date(alarm.timestamp).getHours();
          if (alarmHour !== parseInt(selectedHour)) return false;
        }
      }
      
      if (selectedSeverity !== 'all' && alarm.severity !== selectedSeverity) return false;
      if (selectedStatus !== 'all' && alarm.status !== selectedStatus) return false;
      if (searchTerm && !alarm.siteName.toLowerCase().includes(searchTerm.toLowerCase()) && 
          !alarm.alarmType.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [alarms, selectedSeverity, selectedStatus, searchTerm, selectedDate, selectedHour, showAllHistory]);

  const metrics = useMemo(() => {
    // Filter alarms by date for metrics when not showing all history
    const relevantAlarms = showAllHistory ? alarms : alarms.filter(a => {
      const alarmDate = new Date(a.timestamp).toISOString().split('T')[0];
      return alarmDate === selectedDate;
    });
    
    const critical = relevantAlarms.filter(a => a.severity === 'critical' && a.status === 'active').length;
    const major = relevantAlarms.filter(a => a.severity === 'major' && a.status === 'active').length;
    const minor = relevantAlarms.filter(a => a.severity === 'minor' && a.status === 'active').length;
    const onlineDevices = sites.filter(s => s.status === 'On Air').length;

    return { critical, major, minor, onlineDevices, total: sites.length };
  }, [alarms, sites, selectedDate, showAllHistory]);

  const renderContent = () => {
    // Add responsive padding and margins
    const responsivePadding = 'px-2 sm:px-4 md:px-6';
    const responsiveMargin = 'my-2 sm:my-3 md:my-4';
    switch (view) {
      case 'dashboard':
        return (
          <>
            <div className={`relative h-48 sm:h-56 md:h-64 rounded-xl overflow-hidden ${responsiveMargin}`}>
              <img 
                src="https://d64gsuwffb70l.cloudfront.net/68f204b6a0d31832cb27a1a8_1760691441572_e26ce229.webp" 
                alt="NOC" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-transparent flex items-center">
                <div className="px-12">
                  <h2 className="text-4xl font-bold text-white mb-3">Real-Time Network Monitoring</h2>
                  <p className="text-gray-300 text-lg">Centralized alarm management for enterprise infrastructure</p>
                </div>
              </div>
            </div>

            {/* Date Filter Controls */}
            <div className="mb-6 bg-[#1e2230] rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-300">📅 Date:</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    disabled={showAllHistory}
                    className="bg-[#151820] border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="dashboardShowAllHistory"
                    checked={showAllHistory}
                    onChange={(e) => setShowAllHistory(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 bg-[#151820] border-gray-700 rounded focus:ring-cyan-500"
                  />
                  <label htmlFor="dashboardShowAllHistory" className="text-sm font-medium text-gray-300 cursor-pointer">
                    Show All History
                  </label>
                </div>
                <div className="text-sm text-cyan-400 ml-auto font-medium">
                  {showAllHistory ? '📊 Viewing all historical alarms' : `📊 ${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
                </div>
              </div>
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 ${responsiveMargin}`}>
              <MetricsCard title="Critical Alarms" value={metrics.critical} icon="🔴" color="text-red-400" trend="Requires immediate attention" />
              <MetricsCard title="Major Alarms" value={metrics.major} icon="🟠" color="text-orange-400" trend="High priority incidents" />
              <MetricsCard title="Minor Alarms" value={metrics.minor} icon="🟡" color="text-yellow-400" trend="Monitor closely" />
              <MetricsCard title="Devices Online" value={`${metrics.onlineDevices}/${metrics.total}`} icon="📡" color="text-cyan-400" trend="Network health: 98.5%" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2">
                
              </div>
              <AlarmChart alarms={alarms} showAllHistory={showAllHistory} />
            </div>
          </>
        );

      case 'alarms':
        return (
          <>
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-white mb-2">Alarm Management</h2>
              <p className="text-gray-400">Monitor and manage network alarms in real-time</p>
            </div>

            {/* Date and Hour Filter Controls */}
            <div className="mb-4 bg-[#1e2230] rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-300">📅 Date:</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    disabled={showAllHistory}
                    className="bg-[#151820] border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-300">🕐 Hour:</label>
                  <select
                    value={selectedHour}
                    onChange={(e) => setSelectedHour(e.target.value)}
                    disabled={showAllHistory}
                    className="bg-[#151820] border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
                  >
                    <option value="all">All Hours</option>
                    {Array.from({ length: 24 }, (_, i) => {
                      const nextHour = (i + 1) % 24;
                      return (
                        <option key={i} value={i.toString()}>
                          {i.toString().padStart(2, '0')} to {nextHour.toString().padStart(2, '0')}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="showAllHistory"
                    checked={showAllHistory}
                    onChange={(e) => {
                      setShowAllHistory(e.target.checked);
                      if (e.target.checked) {
                        setSelectedHour('all'); // Reset hour when showing all history
                      }
                    }}
                    className="w-4 h-4 text-cyan-600 bg-[#151820] border-gray-700 rounded focus:ring-cyan-500"
                  />
                  <label htmlFor="showAllHistory" className="text-sm font-medium text-gray-300 cursor-pointer">
                    Show All History
                  </label>
                </div>
                <div className="text-sm text-cyan-400 ml-auto font-medium">
                  {showAllHistory 
                    ? '📊 Viewing all historical alarms' 
                    : selectedHour === 'all'
                      ? `📊 ${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
                      : `📊 ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} from ${selectedHour.padStart(2, '0')} to ${((parseInt(selectedHour) + 1) % 24).toString().padStart(2, '0')}`
                  }
                </div>
              </div>
            </div>

            <FilterPanel
              selectedSeverity={selectedSeverity}
              selectedStatus={selectedStatus}
              searchTerm={searchTerm}
              onSeverityChange={setSelectedSeverity}
              onStatusChange={setSelectedStatus}
              onSearchChange={setSearchTerm}
            />

            <div className="bg-[#1e2230] rounded-lg border border-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h3 className="text-xl font-bold text-white">Live Alarm Feed</h3>
                <p className="text-sm text-gray-400 mt-1">Showing {filteredAlarms.length} of {alarms.length} alarms</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#151820] border-b border-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Severity</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Device</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Alarm Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlarms.slice(0, 30).map(alarm => (
                      <AlarmRow 
                        key={alarm.id} 
                        alarm={alarm} 
                        onClick={() => setSelectedAlarm(alarm)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );

      case 'sites':
        return <SitesManagement />;

      case 'topology':
        return (
          <>
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white mb-2">Network Topology</h2>
              <p className="text-gray-400">Visual representation of network infrastructure</p>
            </div>
            
          </>
        );

      case 'users':
        return <UserManagement />;

      case 'notifications':
        return <NotificationSettings />;

      case 'audit':
        return <AuditLog />;

      case 'tickets':
        return <TicketManagement />;

      case 'outage-reports':
        return <OutageReports />;

      case 'hourly-reports':
        return <HourlyOutageReports />;

      case 'reports':
        return <Reports />;

      case 'settings':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">System Settings</h2>
              <p className="text-gray-400">Configure NOCALERT platform settings</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#1e2230] rounded-lg border border-gray-800 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">SNMP Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Community String</label>
                    <input type="password" value="••••••••" className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300" readOnly />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Trap Port</label>
                    <input type="text" value="162" className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300" readOnly />
                  </div>
                </div>
              </div>
              <div className="bg-[#1e2230] rounded-lg border border-gray-800 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Database Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">MongoDB URI</label>
                    <input type="text" value="mongodb://localhost:27017/nocalert" className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300" readOnly />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Retention Period</label>
                    <input type="text" value="90 days" className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300" readOnly />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return <div>View not found</div>;
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#0f1219] text-white overflow-hidden">
      <div className="md:hidden">
        {/* Mobile menu button */}
        <button 
          onClick={() => document.getElementById('sidebar')?.classList.toggle('hidden')}
          className="fixed bottom-4 right-4 z-50 p-3 bg-cyan-600 rounded-full shadow-lg md:hidden"
          aria-label="Toggle menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
        </button>
      </div>
      
      <div id="sidebar" className="hidden md:block md:flex-shrink-0">
        <Sidebar activeView={view} onViewChange={handleViewChange} />
      </div>
      
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
        <div className="max-w-7xl mx-auto w-full">
          <div className="bg-[#1e2230] rounded-xl p-4 sm:p-6">
            {renderContent()}
          </div>
        </div>
      </main>

      {selectedAlarm && (
        <AlarmModal 
          alarm={selectedAlarm} 
          onClose={() => setSelectedAlarm(null)} 
          onAcknowledge={handleAcknowledge}
          onResolve={handleResolve}
        />
      )}
    </div>
  );
}
