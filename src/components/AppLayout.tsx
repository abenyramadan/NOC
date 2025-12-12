import React, { useState, useMemo, useEffect } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
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
import { TicketManagement } from './TicketManagement';
import { Reports } from './Reports';
import { OutageReports } from './OutageReports';
import { HourlyOutageReports } from './HourlyOutageReports';
import { AuditLog } from './AuditLog';
import { ThemeToggle } from '@/components/ThemeToggle';
import EmailManagement from './EmailManagement';

import { alarmManagementService } from '../services/alarmManagementService';
import { outageReportService } from '../services/outageReportService';
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
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [period, setPeriod] = useState<'daily' | 'monthly'>('daily');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  // Daily snapshot for dashboard visuals
  const [dailyTicketsPerRegion, setDailyTicketsPerRegion] = useState<Array<{ region: string; totalTickets: number }>>([]);
  const [dailyRootCauses, setDailyRootCauses] = useState<Array<{ rootCause: string; count: number }>>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [dailySummary, setDailySummary] = useState<{ totalReports: number; totalInProgress: number; totalResolved: number; totalWithinSLA: number; mttr: number; slaPercentage?: number } | null>(null);
  const [monthlyMatrix, setMonthlyMatrix] = useState<{ days: number; regions: string[]; values: Record<string, number[]> } | null>(null);
  const [trendRange, setTrendRange] = useState<7 | 30>(7);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendData, setTrendData] = useState<Array<{ date: string; sla: number; mttr: number }>>([]);

  // Fetch real alarms data
  useEffect(() => {
    const fetchAlarms = async () => {
      try {
        const fetchedAlarms = await alarmManagementService.getAllAlarms({
          // Fetch a larger window when in monthly mode to cover the month
          limit: period === 'monthly' ? 5000 : (showAllHistory ? 1000 : 100),
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
  }, [showAllHistory, period, selectedMonth]);

  // Fetch snapshot (daily or monthly)
  useEffect(() => {
    const fetchSnapshot = async () => {
      try {
        setDailyLoading(true);
        setDailyError(null);

        if (period === 'daily') {
          const dateStr = selectedDate;
          const data = await outageReportService.getDailyReports(dateStr);
          setDailyTicketsPerRegion((data?.ticketsPerRegion || []).map((r: any) => ({
            region: r.region ?? 'Unknown',
            totalTickets: Number(r.totalTickets ?? 0)
          })));
          setDailyRootCauses((data?.alarmsByRootCause || []).map((c: any) => ({
            rootCause: c.rootCause ?? 'Not specified',
            count: Number(c.count ?? 0)
          })));
          const s = (data?.summary as any) || {};
          const withinSLATotal = (data?.ticketsPerRegion || []).reduce((acc: number, r: any) => acc + Number(r.withinSLA ?? r.within_sla ?? 0), 0);
          const slaPct = s.totalResolved > 0 ? Math.round((withinSLATotal / Number(s.totalResolved)) * 100) : 0;
          setDailySummary({
            totalReports: Number(s.totalReports ?? 0),
            totalInProgress: Number(s.totalInProgress ?? 0),
            totalResolved: Number(s.totalResolved ?? 0),
            totalWithinSLA: withinSLATotal,
            mttr: Number(s.mttr ?? 0),
            slaPercentage: slaPct
          });
          setMonthlyMatrix(null);
        } else {
          // Monthly aggregation via backend endpoint for accuracy/efficiency
          const [yearStr, monthStr] = selectedMonth.split('-');
          const year = parseInt(yearStr, 10);
          const month = parseInt(monthStr, 10); // 1-12
          const daysInMonth = new Date(year, month, 0).getDate();

          const monthly = await outageReportService.getMonthlyMetrics(selectedMonth);
          setDailyTicketsPerRegion((monthly.ticketsPerRegion || []).map((r: any) => ({
            region: r.region ?? 'Unknown',
            totalTickets: Number(r.totalTickets ?? 0)
          })));
          setDailyRootCauses((monthly.alarmsByRootCause || []).map((c: any) => ({
            rootCause: c.rootCause ?? 'Not specified',
            count: Number(c.count ?? 0)
          })));

          // Summary from monthly totals
          const totalReports = Number(monthly.summary?.totalReports ?? 0);
          const resolvedTicketsSum = (monthly.ticketsPerRegion || []).reduce((acc: number, r: any) => acc + Number(r.resolvedTickets ?? 0), 0);
          const inProgressSum = (monthly.ticketsPerRegion || []).reduce((acc: number, r: any) => acc + Number(r.inProgressTickets ?? 0), 0);
          const withinSum = (monthly.ticketsPerRegion || []).reduce((acc: number, r: any) => acc + Number(r.withinSLATickets ?? r.within_sla ?? 0), 0);
          const slaPct = resolvedTicketsSum > 0 ? Math.round((withinSum / resolvedTicketsSum) * 100) : 0;
          // Heatmap: use backend-provided regionDayMatrix (no per-day client calls)
          if (monthly.regionDayMatrix) {
            setMonthlyMatrix({
              days: Number(monthly.regionDayMatrix.days || daysInMonth),
              regions: monthly.regionDayMatrix.regions || [],
              values: monthly.regionDayMatrix.values || {}
            });
          } else {
            setMonthlyMatrix({ days: daysInMonth, regions: [], values: {} });
          }

          const monthlyMttr = Number(monthly.summary?.mttr ?? 0);
          setDailySummary({
            totalReports,
            totalInProgress: inProgressSum,
            totalResolved: resolvedTicketsSum,
            totalWithinSLA: withinSum,
            mttr: monthlyMttr,
            slaPercentage: slaPct
          });
        }
      } catch (e: any) {
        setDailyError(e?.message || 'Failed to load snapshot');
        setDailyTicketsPerRegion([]);
        setDailyRootCauses([]);
        setDailySummary(null);
        setMonthlyMatrix(null);
      } finally {
        setDailyLoading(false);
      }
    };
    fetchSnapshot();
  }, [selectedDate, period, selectedMonth]);

  // Fetch SLA/MTTR trends for last N days based on selected date
  useEffect(() => {
    const fetchTrends = async () => {
      try {
        setTrendLoading(true);
        const end = new Date(selectedDate);
        const points: Array<{ date: string; sla: number; mttr: number }> = [];
        for (let i = trendRange - 1; i >= 0; i--) {
          const d = new Date(end);
          d.setDate(end.getDate() - i);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const dateStr = `${y}-${m}-${day}`;
          try {
            const data = await outageReportService.getDailyReports(dateStr);
            const s = (data?.summary as any) || {};
            const within = (data?.ticketsPerRegion || []).reduce((acc: number, r: any) => acc + Number(r.withinSLA ?? r.within_sla ?? 0), 0);
            const resolved = Number(s.totalResolved ?? 0);
            const sla = resolved > 0 ? Math.round((within / resolved) * 100) : 0;
            const mttr = Number(s.mttr ?? 0);
            points.push({ date: `${m}-${day}`, sla, mttr });
          } catch {}
        }
        setTrendData(points);
      } finally {
        setTrendLoading(false);
      }
    };
    fetchTrends();
  }, [selectedDate, trendRange]);

  // Listen for outage reports updates to refresh alarms when they are resolved
  useEffect(() => {
    const handleOutageReportsUpdate = () => {
      // Refresh alarms data when outage reports are updated
      const fetchAlarms = async () => {
        try {
          const fetchedAlarms = await alarmManagementService.getAllAlarms({
            // Fetch a larger window when in monthly mode to cover the month
            limit: period === 'monthly' ? 5000 : (showAllHistory ? 1000 : 100),
            sortBy: 'timestamp',
            sortOrder: 'desc'
          });
          setAlarms(fetchedAlarms);
        } catch (error) {
          console.error('Error refreshing alarms after outage update:', error);
        }
      };
      fetchAlarms();
    };

    window.addEventListener('outageReportsUpdated', handleOutageReportsUpdate);

    // Cleanup event listener on unmount
    return () => {
      window.removeEventListener('outageReportsUpdated', handleOutageReportsUpdate);
    };
  }, [showAllHistory, period]);

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
      }
      
      if (selectedSeverity !== 'all' && alarm.severity !== selectedSeverity) return false;
      if (selectedStatus !== 'all' && alarm.status !== selectedStatus) return false;
      if (searchTerm && !alarm.siteName.toLowerCase().includes(searchTerm.toLowerCase()) && 
          !alarm.alarmType.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [alarms, selectedSeverity, selectedStatus, searchTerm, selectedDate, showAllHistory]);

  const metrics = useMemo(() => {
    let relevantAlarms = alarms;
    if (!showAllHistory) {
      if (period === 'monthly') {
        const [y, m] = selectedMonth.split('-').map(n => parseInt(n, 10));
        const start = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
        const end = new Date(y, m, 0, 23, 59, 59, 999).getTime();
        relevantAlarms = alarms.filter(a => {
          const t = new Date(a.timestamp).getTime();
          return t >= start && t <= end;
        });
      } else {
        relevantAlarms = alarms.filter(a => {
          const alarmDate = new Date(a.timestamp).toISOString().split('T')[0];
          return alarmDate === selectedDate;
        });
      }
    }

    const critical = relevantAlarms.filter(a => a.severity === 'critical' && a.status === 'active').length;
    const major = relevantAlarms.filter(a => a.severity === 'major' && a.status === 'active').length;
    const minor = relevantAlarms.filter(a => a.severity === 'minor' && a.status === 'active').length;
    const onlineDevices = sites.filter(s => s.status === 'On Air').length;

    return { critical, major, minor, onlineDevices, total: sites.length };
  }, [alarms, sites, selectedDate, selectedMonth, period, showAllHistory]);

  const renderContent = () => {
    // Add responsive padding and margins
    const responsivePadding = 'px-2 sm:px-4 md:px-6';
    const responsiveMargin = 'my-2 sm:my-3 md:my-4';
    switch (view) {
      case 'dashboard':
        return (
          <>
            {/* Welcome Banner */}
            <div className="bg-card rounded-lg border border-border p-5 mb-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Welcome to the NOC Dashboard</h2>
                  <p className="text-sm text-muted-foreground mt-1">Real-time view of network performance, tickets, and SLA metrics</p>
                </div>
                <div className="text-sm text-primary font-medium">
                  {new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 ${responsiveMargin}`}>
              {[
                { title: 'Total Tickets', value: dailySummary?.totalReports || 0 },
                { title: 'In Progress', value: dailySummary?.totalInProgress || 0 },
                { title: 'Resolved', value: dailySummary?.totalResolved || 0 },
                { title: 'SLA %', value: (dailySummary?.slaPercentage ?? 0) + '%' },
                { title: 'MTTR (min)', value: dailySummary?.mttr || 0 }
              ].map((kpi) => (
                <motion.div key={kpi.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="bg-card rounded-lg border border-border p-4">
                  <div className="text-sm text-muted-foreground">{kpi.title}</div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{kpi.value}</div>
                </motion.div>
              ))}
            </div>

            {/* Date/Period Filter Controls */}
            <div className="mb-6 bg-card rounded-lg p-4 border border-border">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-muted-foreground">📅 Period:</label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as 'daily' | 'monthly')}
                    className="bg-background border border-input rounded px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                {period === 'daily' ? (
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-muted-foreground">Date:</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      disabled={showAllHistory}
                      className="bg-background border border-input rounded px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-muted-foreground">Month:</label>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="bg-background border border-input rounded px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="dashboardShowAllHistory"
                    checked={showAllHistory}
                    onChange={(e) => setShowAllHistory(e.target.checked)}
                    className="w-4 h-4 text-primary bg-background border-input rounded focus:ring-primary"
                  />
                  <label htmlFor="dashboardShowAllHistory" className="text-sm font-medium text-foreground cursor-pointer">
                    Show All History
                  </label>
                </div>
                <div className="text-sm text-primary ml-auto font-medium">
                  {showAllHistory
                    ? '📊 Viewing all historical alarms'
                    : period === 'daily'
                      ? `📊 ${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
                      : (() => {
                          const [y, m] = selectedMonth.split('-');
                          const monthName = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
                          return `📊 ${monthName}`;
                        })()
                  }
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
              {/* Left: Dashboard charts */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-card rounded-lg border border-border p-4">
                  <h3 className="text-base font-semibold text-foreground mb-3">Tickets by Region</h3>
                  {dailyLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
                  {!dailyLoading && dailyTicketsPerRegion.length === 0 && (
                    <div className="text-sm text-muted-foreground">No data</div>
                  )}
                  {!dailyLoading && dailyTicketsPerRegion.length > 0 && (
                    <div style={{ width: '100%', height: 260 }}>
                      <ResponsiveContainer>
                        <BarChart data={[...dailyTicketsPerRegion].sort((a,b)=>b.totalTickets-a.totalTickets)} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="region" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={50} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="totalTickets" fill="#3b82f6" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="bg-card rounded-lg border border-border p-4">
                  <h3 className="text-base font-semibold text-foreground mb-3">Common Root Causes (Top 5)</h3>
                  {dailyLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
                  {!dailyLoading && dailyRootCauses.length === 0 && (
                    <div className="text-sm text-muted-foreground">No data</div>
                  )}
                  {!dailyLoading && dailyRootCauses.length > 0 && (
                    <div style={{ width: '100%', height: 260 }}>
                      <ResponsiveContainer>
                        <BarChart data={[...dailyRootCauses].sort((a,b)=>b.count-a.count).slice(0,5)} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="rootCause" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={50} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#10b981" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: SLA% and MTTR Trends */}
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-foreground">SLA% and MTTR Trends</h3>
                  <select
                    value={trendRange}
                    onChange={(e) => setTrendRange(Number(e.target.value) as 7 | 30)}
                    className="bg-background border border-input rounded px-2 py-1 text-sm text-foreground"
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                  </select>
                </div>
                {trendLoading ? (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                ) : trendData.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No trend data</div>
                ) : (
                  <div className="space-y-6">
                    <div style={{ width: '100%', height: 180 }}>
                      <ResponsiveContainer>
                        <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="sla" name="SLA %" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ width: '100%', height: 180 }}>
                      <ResponsiveContainer>
                        <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="mttr" name="MTTR (min)" stroke="#10b981" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Region stats and Heatmap */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-base font-semibold text-foreground mb-3">Region with Most Tickets</h3>
                {dailyLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
                {!dailyLoading && (
                  <div className="flex items-baseline justify-between">
                    {(() => {
                      const most = dailyTicketsPerRegion.length > 0
                        ? [...dailyTicketsPerRegion].sort((a, b) => b.totalTickets - a.totalTickets)[0]
                        : null;
                      return (
                        <>
                          <div className="text-2xl font-semibold text-foreground">{most ? most.region : '—'}</div>
                          <div className="text-lg text-muted-foreground tabular-nums">{most ? most.totalTickets : 0}</div>
                        </>
                      );
                    })()}
                  </div>
                )}
                <div className="mt-3 text-xs text-muted-foreground">Highest ticket count among regions for the selected date.</div>
              </div>

              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-base font-semibold text-foreground mb-3">Region with Least Tickets</h3>
                {dailyLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
                {!dailyLoading && (
                  <div className="flex items-baseline justify-between">
                    {(() => {
                      const least = dailyTicketsPerRegion.length > 0
                        ? [...dailyTicketsPerRegion].sort((a, b) => a.totalTickets - b.totalTickets)[0]
                        : null;
                      return (
                        <>
                          <div className="text-2xl font-semibold text-foreground">{least ? least.region : '—'}</div>
                          <div className="text-lg text-muted-foreground tabular-nums">{least ? least.totalTickets : 0}</div>
                        </>
                      );
                    })()}
                  </div>
                )}
                <div className="mt-3 text-xs text-muted-foreground">Lowest ticket count among regions for the selected date.</div>
              </div>

              {/* Simple monthly region heatmap grid */}
              <div className="bg-card rounded-lg border border-border p-4 md:col-span-2">
                <h3 className="text-base font-semibold text-foreground mb-3">Region Heatmap {period === 'monthly' ? `(by day)` : ''}</h3>
                {period === 'monthly' && monthlyMatrix && monthlyMatrix.regions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <div className="min-w-full">
                      <div className="grid" style={{ gridTemplateColumns: `160px repeat(${monthlyMatrix.days}, 1fr)` }}>
                        <div></div>
                        {Array.from({ length: monthlyMatrix.days }, (_, i) => (
                          <div key={i} className="text-[10px] text-muted-foreground text-center">{i + 1}</div>
                        ))}
                        {monthlyMatrix.regions.map(region => (
                          <React.Fragment key={region}>
                            <div className="text-xs pr-2 py-1 truncate text-foreground">{region}</div>
                            {Array.from({ length: monthlyMatrix.days }, (_, i) => {
                              const v = monthlyMatrix.values[region]?.[i] || 0;
                              const intensity = Math.min(1, v / Math.max(1, Math.max(...(monthlyMatrix.values[region] || [0]))));
                              const bg = `rgba(59,130,246,${0.1 + intensity * 0.9})`;
                              return <div key={i} title={`${region} • Day ${i + 1}: ${v}`} className="h-4 m-[1px] rounded" style={{ backgroundColor: bg }}></div>;
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Switch to Monthly to view heatmap</div>
                )}
              </div>
            </div>
          </>
        );

      case 'alarms':
        return (
          <>
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-foreground mb-2">Alarm Management</h2>
              <p className="text-muted-foreground">Monitor and manage network alarms in real-time</p>
            </div>

            {/* Date and Hour Filter Controls */}
            <div className="mb-4 bg-card rounded-lg p-4 border border-border">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-muted-foreground">📅 Date:</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    disabled={showAllHistory}
                    className="bg-background border border-input rounded px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="showAllHistory"
                    checked={showAllHistory}
                    onChange={(e) => setShowAllHistory(e.target.checked)}
                    className="w-4 h-4 text-primary bg-background border-input rounded focus:ring-primary"
                  />
                  <label htmlFor="showAllHistory" className="text-sm font-medium text-foreground cursor-pointer">
                    Show All History
                  </label>
                </div>
                <div className="text-sm text-primary ml-auto font-medium">
                  {showAllHistory 
                    ? '📊 Viewing all historical alarms' 
                    : `📊 ${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
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

            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h3 className="text-xl font-bold text-foreground">Live Alarm Feed</h3>
                <p className="text-sm text-muted-foreground mt-1">Showing {filteredAlarms.length} of {alarms.length} alarms</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-background border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Severity</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Device</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Alarm Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Timestamp</th>
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
              <h2 className="text-3xl font-bold text-foreground mb-2">Network Topology</h2>
              <p className="text-muted-foreground">Visual representation of network infrastructure</p>
            </div>
            
          </>
        );

      case 'users':
        return <UserManagement />;

      case 'notifications':
        return null;

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

      case 'email-management':
        return <EmailManagement />;

      case 'settings':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-2">System Settings</h2>
              <p className="text-muted-foreground">Configure NOCALERT platform settings</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-card rounded-lg border border-border p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">SNMP Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Community String</label>
                    <input type="password" value="••••••••" className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground" readOnly />
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Trap Port</label>
                    <input type="text" value="162" className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground" readOnly />
                  </div>
                </div>
              </div>
              <div className="bg-card rounded-lg border border-border p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Database Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">MongoDB URI</label>
                    <input type="text" value="mongodb://localhost:27017/nocalert" className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground" readOnly />
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground mb-2">Retention Period</label>
                    <input type="text" value="90 days" className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground" readOnly />
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
    <div className="flex flex-col md:flex-row h-screen bg-background text-foreground overflow-hidden">
      <div className="md:hidden">
        {/* Mobile menu button */}
        <button 
          onClick={() => document.getElementById('sidebar')?.classList.toggle('hidden')}
          className="fixed bottom-4 right-4 z-50 p-3 bg-primary rounded-full shadow-lg md:hidden"
          aria-label="Toggle menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
        </button>
        
        {/* Mobile theme toggle */}
        <div className="fixed bottom-4 left-4 z-50 md:hidden">
          <ThemeToggle />
        </div>
      </div>
      
      <div id="sidebar" className="hidden md:block md:flex-shrink-0">
        <Sidebar activeView={view} onViewChange={handleViewChange} />
      </div>
      
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
        <div className="max-w-7xl mx-auto w-full">
          <div className="bg-card rounded-xl p-4 sm:p-6 border border-border">
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
