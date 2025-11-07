import React, { useState, useEffect, useMemo } from 'react';
import { Clock, TrendingUp, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

// Helper function to calculate SLA status based on resolution time and expected hours
const calculateSlaStatus = (outage) => {
  // If SLA status is already set, use it
  if (outage.slaStatus) {
    return outage.slaStatus;
  }
  
  // If we don't have resolution time or expected hours, can't calculate
  if (!outage.resolutionTime || !outage.expectedResolutionHours) {
    return 'unknown';
  }
  
  const resolutionTime = new Date(outage.resolutionTime).getTime();
  const occurrenceTime = new Date(outage.occurrenceTime).getTime();
  const expectedResolutionMs = outage.expectedResolutionHours * 60 * 60 * 1000;
  const actualResolutionMs = resolutionTime - occurrenceTime;
  
  return actualResolutionMs <= expectedResolutionMs ? 'within' : 'out';
};

interface NetworkPerformanceReport {
  reportHour: Date;
  ongoingOutages: OutageItem[];
  resolvedOutages: OutageItem[];
  metrics: {
    totalResolved: number;
    withinSLA: number;
    outOfSLA: number;
    mttr: number;
  };
  ticketsPerRegion: RegionTicketSummary[];
}

interface RegionTicketSummary {
  region: string;
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  withinSLATickets: number;
  outOfSLATickets: number;
  criticalAlarms: number;
  majorAlarms: number;
  minorAlarms: number;
}

interface OutageItem {
  id: string;
  siteNo: string;
  siteCode: string;
  region: 'Bahr gha zal' | 'Equatoria' | 'Upper Nile';
  alarmType: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'WARNING' | 'INFO';
  occurrenceTime: Date;
  resolutionTime?: Date;
  expectedResolutionHours?: number;
  expectedRestorationTime?: Date;
  mandatoryRestorationTime: Date;
  supervisor: string;
  username: string;
  rootCause?: 'Generator' | 'Transmission' | 'Radio' | 'Environment' | 'Others';
  subrootCause?: string;
  status: 'In Progress' | 'Resolved';
}

export const HourlyOutageReports: React.FC = () => {
  const [reports, setReports] = useState<NetworkPerformanceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Calculate metrics using useMemo at the top level to ensure consistent hook order
  const metrics = useMemo(() => {
    // If no report yet, return default values
    if (!reports[0]) {
      return {
        totalResolved: 0,
        withinSLA: 0,
        outOfSLA: 0,
        mttr: 0
      };
    }
    
    const currentReport = reports[0];
    const resolvedOutages = currentReport?.resolvedOutages || [];
    const totalResolved = resolvedOutages.length;
    const withinSLA = resolvedOutages.filter(outage => calculateSlaStatus(outage) === 'within').length;
    const outOfSLA = resolvedOutages.filter(outage => calculateSlaStatus(outage) === 'out').length;
    
    // Calculate MTTR (Mean Time To Resolution) in minutes
    let mttr = 0;
    if (totalResolved > 0) {
      const totalTime = resolvedOutages.reduce((sum, outage) => {
        if (outage.resolutionTime && outage.occurrenceTime) {
          const resolutionTime = new Date(outage.resolutionTime).getTime();
          const occurrenceTime = new Date(outage.occurrenceTime).getTime();
          return sum + (resolutionTime - occurrenceTime);
        }
        return sum;
      }, 0);
      mttr = Math.round((totalTime / totalResolved) / (60 * 1000)); // Convert ms to minutes
    }
    
    return {
      totalResolved,
      withinSLA,
      outOfSLA,
      mttr
    };
  }, [reports]);

  useEffect(() => {
    fetchNetworkPerformanceReports();

    // Listen for outage reports updates from other components
    const handleOutageReportsUpdate = () => {
      fetchNetworkPerformanceReports();
    };

    window.addEventListener('outageReportsUpdated', handleOutageReportsUpdate);

    // Cleanup event listener on unmount
    return () => {
      window.removeEventListener('outageReportsUpdated', handleOutageReportsUpdate);
    };
  }, []);

  const fetchNetworkPerformanceReports = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }
      
      // Fetch current day's cumulative report (no date/hour filtering needed)
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/outage-reports/hourly`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch hourly reports' }));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('API Response:', JSON.stringify(data, null, 2));
      
      // Ensure ticketsPerRegion exists and is an array
      const processedData = {
        ...data,
        ticketsPerRegion: Array.isArray(data.ticketsPerRegion) ? data.ticketsPerRegion : [],
        ongoingOutages: Array.isArray(data.ongoingOutages) ? data.ongoingOutages : [],
        resolvedOutages: Array.isArray(data.resolvedOutages) ? data.resolvedOutages : []
      };
      
      console.log('Processed data:', processedData);
      setReports([processedData]);
    } catch (err) {
      console.error('Failed to fetch hourly reports:', err);
      setError(err instanceof Error ? err.message : 'Failed to load hourly reports');
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (date: Date | string | null | undefined) => {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const getAlarmTypeColor = (alarmType: string) => {
    switch (alarmType) {
      case 'CRITICAL': return 'text-red-600 font-bold';
      case 'MAJOR': return 'text-orange-600 font-bold';
      case 'MINOR': return 'text-yellow-600 font-bold';
      default: return 'text-gray-400';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'In Progress': return 'bg-yellow-100 text-yellow-800';
      case 'Resolved': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Early return for loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading network performance reports...</div>
      </div>
    );
  }

  // Early return for error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-red-400 text-center">
          <p className="font-semibold mb-2">Error loading network performance reports</p>
          <p className="text-sm">{error}</p>
        </div>
        {error.includes('authentication') || error.includes('token') ? (
          <button
            onClick={() => window.location.href = '/login'}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Login
          </button>
        ) : (
          <button
            onClick={fetchNetworkPerformanceReports}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  // Early return for no data state
  if (reports.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">No report data available</div>
      </div>
    );
  }

  const currentReport = reports[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Hourly Outage Report</h2>
          <div className="text-sm text-gray-400">
            Generated on {new Date().toLocaleString('en-US', {
              month: '2-digit',
              day: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            })} • {currentReport?.ongoingOutages?.length || 0} Active Outages • {currentReport?.resolvedOutages?.length || 0} Resolved Today
          </div>
        </div>
        <p className="text-gray-400 text-sm mt-1">View comprehensive daily outage reports with all active and historical outages from today</p>
      </div>

      {/* No date/hour selector needed - shows current day's cumulative report */}
      <div className="bg-[#1e2230] rounded-lg p-6 border border-gray-800 mb-6">
        <div className="text-center">
          <p className="text-gray-400">Showing all outages from today ({new Date().toLocaleDateString()})</p>
          <p className="text-sm text-gray-500 mt-1">Reports are generated hourly throughout the day</p>
        </div>
      </div>

      {currentReport && (
        <>
          {/* Metrics Cards */}
          <div className="flex flex-nowrap overflow-x-auto pb-4 -mx-2 px-2">
            <div className="flex-none w-64 mx-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase opacity-90">Total Tickets</h3>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </div>
              <div className="text-4xl font-bold mb-1">
                {currentReport.ongoingOutages.length + (currentReport.resolvedOutages?.length || 0)}
              </div>
              <p className="text-sm opacity-80">Issues reported today</p>
            </div>

            <div className="flex-none w-64 mx-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase opacity-90">In Progress</h3>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 6v6l4 2"></path>
                </svg>
              </div>
              <div className="text-4xl font-bold mb-1">
                {currentReport.ongoingOutages.length}
              </div>
              <p className="text-sm opacity-80">Active issues being resolved</p>
            </div>

            <div className="flex-none w-64 mx-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase opacity-90">Total Resolved</h3>
                <CheckCircle className="w-8 h-8 opacity-80" />
              </div>
              <div className="text-4xl font-bold mb-1">{metrics.totalResolved}</div>
              <p className="text-sm opacity-80">Resolved today</p>
            </div>

            <div className="flex-none w-64 mx-2 bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase opacity-90">Within SLA</h3>
                <TrendingUp className="w-8 h-8 opacity-80" />
              </div>
              <div className="text-4xl font-bold mb-1">{metrics.withinSLA}</div>
              <p className="text-sm opacity-80">
                {metrics.totalResolved > 0
                  ? Math.round((metrics.withinSLA / metrics.totalResolved) * 100)
                  : 0}% compliance
              </p>
            </div>

            <div className="flex-none w-64 mx-2 bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase opacity-90">Out of SLA</h3>
                <XCircle className="w-8 h-8 opacity-80" />
              </div>
              <div className="text-4xl font-bold mb-1">{metrics.outOfSLA}</div>
              <p className="text-sm opacity-80">
                {metrics.totalResolved > 0
                  ? Math.round((metrics.outOfSLA / metrics.totalResolved) * 100)
                  : 0}% breached
              </p>
            </div>

            <div className="flex-none w-64 mx-2 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase opacity-90">MTTR</h3>
                <Clock className="w-8 h-8 opacity-80" />
              </div>
              <div className="text-4xl font-bold mb-1">{metrics.mttr || 'N/A'}</div>
              <p className="text-sm opacity-80">Minutes (avg)</p>
            </div>
          </div>

          {/* Ongoing Outages Section */}
          <div className="bg-[#1e2230] rounded-lg border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 bg-red-900/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <h3 className="text-xl font-bold text-white">
                  🔴 All Ongoing Outages ({currentReport.ongoingOutages.length})
                </h3>
              </div>
            </div>

            {currentReport.ongoingOutages.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#151820] border-b border-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Site No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Site Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Region</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Alarm Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Occurrence Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Expected Restoration Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Mandatory Restoration Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Supervisor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Root Cause</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Subroot Cause</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Username</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Actual Resolution</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReport.ongoingOutages.map((outage) => (
                      <tr key={outage.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-sm text-gray-300">{outage.siteNo}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">{outage.siteCode}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">{outage.region}</td>
                        <td className={`px-4 py-3 text-sm ${getAlarmTypeColor(outage.alarmType)}`}>
                          {outage.alarmType}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {formatDateTime(outage.occurrenceTime)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          <span className="text-blue-400 font-semibold">
                            {outage.expectedRestorationTime ? formatDateTime(outage.expectedRestorationTime) : 'Not set'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          <span className="text-red-400 font-semibold">
                            {outage.mandatoryRestorationTime ? formatDateTime(outage.mandatoryRestorationTime) : 'Not set'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">{outage.supervisor}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          <span className="italic text-yellow-300">{outage.rootCause || 'Under Investigation'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          <span className="italic text-yellow-300">{outage.subrootCause || 'N/A'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          <span className="text-purple-300">{outage.username || 'N/A'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          <span className="text-gray-500 italic">Not Resolved Yet</span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(outage.status)}`}>
                            {outage.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-400">✅ No ongoing outages in the system</p>
              </div>
            )}
          </div>

          {/* Resolved Outages Section */}
          <div className="bg-[#1e2230] rounded-lg border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 bg-green-900/20">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <h3 className="text-xl font-bold text-white">
                  ✅ All Resolved/Closed Outages ({currentReport.resolvedOutages.length})
                </h3>
              </div>
            </div>

            {currentReport.resolvedOutages.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#151820] border-b border-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Site No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Site Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Region</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Alarm Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Occurrence Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Expected Restoration Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Mandatory Restoration Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Actual Resolution Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">SLA Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Root Cause</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Subroot Cause</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Username</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Supervisor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReport.resolvedOutages.map((outage) => {
                      const startTime = new Date(outage.occurrenceTime);
                      const endTime = outage.resolutionTime ? new Date(outage.resolutionTime) : null;
                      const mandatoryRestorationTime = outage.mandatoryRestorationTime ? new Date(outage.mandatoryRestorationTime) : null;
                      let slaStatus = 'N/A';
                      let slaColor = 'text-gray-400';
                      
                      if (startTime && endTime && mandatoryRestorationTime && !isNaN(mandatoryRestorationTime.getTime())) {
                        if (endTime <= mandatoryRestorationTime) {
                          slaStatus = '✅ Within SLA';
                          slaColor = 'text-green-500 font-semibold';
                        } else {
                          slaStatus = `❌ Out of SLA (${formatDateTime(endTime)} > ${formatDateTime(mandatoryRestorationTime)})`;
                          slaColor = 'text-red-500 font-semibold';
                        }
                      } else {
                        slaStatus = `⏳ SLA Not Set (${formatDateTime(endTime)})`;
                        slaColor = 'text-yellow-500 font-semibold';
                      }
                      
                      return (
                      <tr key={outage.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-sm text-gray-300">{outage.siteNo}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">{outage.siteCode}</td>
                        <td className="px-4 py-3 text-sm text-gray-300">{outage.region}</td>
                        <td className={`px-4 py-3 text-sm ${getAlarmTypeColor(outage.alarmType)}`}>
                          {outage.alarmType}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {formatDateTime(outage.occurrenceTime)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          <span className="text-blue-400 font-semibold">
                            {outage.expectedRestorationTime ? formatDateTime(outage.expectedRestorationTime) : 'Not set'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          <span className="text-red-400 font-semibold">
                            {outage.mandatoryRestorationTime ? formatDateTime(outage.mandatoryRestorationTime) : 'Not set'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {outage.resolutionTime ? formatDateTime(outage.resolutionTime) : 'N/A'}
                        </td>
                        <td className={`px-4 py-3 text-sm ${slaColor}`}>
                          {slaStatus}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {outage.rootCause || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {outage.subrootCause || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          <span className="text-purple-300">{outage.username || 'N/A'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">{outage.supervisor}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {outage.status}
                          </span>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-400">No outages have been resolved in the system</p>
              </div>
            )}
          </div>

          {/* Tickets Per Region */}
          <div className="bg-[#1e2230] rounded-lg border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 bg-blue-900/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-blue-500" />
                <h3 className="text-xl font-bold text-white">
                  📊 Tickets Per Region ({(currentReport.ticketsPerRegion || []).length} regions)
                </h3>
              </div>
            </div>

            {(currentReport.ticketsPerRegion || []).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#151820] border-b border-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Region</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Total Tickets</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">In Progress</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Resolved</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Within SLA</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Out of SLA</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Critical</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Major</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Minor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReport.ticketsPerRegion.map((regionData, index) => (
                      <tr key={`${regionData.region}-${index}`} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-sm font-semibold text-white">{regionData.region}</td>
                        <td className="px-4 py-3 text-sm text-blue-400 font-bold">{regionData.totalTickets}</td>
                        <td className="px-4 py-3 text-sm text-yellow-400">{regionData.inProgressTickets}</td>
                        <td className="px-4 py-3 text-sm text-green-400">{regionData.resolvedTickets}</td>
                        <td className="px-4 py-3 text-sm text-green-500 font-semibold">{regionData.withinSLATickets || 0}</td>
                        <td className="px-4 py-3 text-sm text-red-500 font-semibold">{regionData.outOfSLATickets || 0}</td>
                        <td className="px-4 py-3 text-sm text-red-500 font-semibold">{regionData.criticalAlarms}</td>
                        <td className="px-4 py-3 text-sm text-orange-500 font-semibold">{regionData.majorAlarms}</td>
                        <td className="px-4 py-3 text-sm text-yellow-500">{regionData.minorAlarms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-400">No regional ticket data available</p>
              </div>
            )}
          </div>
        </>
      )}

      {!currentReport && !loading && (
        <div className="text-center py-12">
          <p className="text-gray-400">No network performance data available</p>
        </div>
      )}
    </div>
  );
};
