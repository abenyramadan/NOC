import React, { useState, useEffect, useMemo } from 'react';
import { Clock, TrendingUp, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { outageReportService } from '../services/outageReportService';
import { siteRegionService } from '../services/siteRegionService';

const calculateSlaStatus = (outage: OutageItem): 'within' | 'out' | 'unknown' => {
  // 1. Use stored SLA if already resolved and saved
  if ((outage as any).slaStatus) {
    return (outage as any).slaStatus;
  }

  // 2. Must have both timestamps
  if (!outage.resolutionTime || !outage.occurrenceTime) {
    return 'unknown';
  }

  const resolutionTime = new Date(outage.resolutionTime).getTime();
  const occurrenceTime = new Date(outage.occurrenceTime).getTime();

  if (isNaN(resolutionTime) || isNaN(occurrenceTime)) {
    return 'unknown';
  }

  const actualResolutionMs = resolutionTime - occurrenceTime;

  // ---------------------------------------------------
  // 3. SLA PRIORITY #1 – Mandatory Restoration Time (MRT)
  // ---------------------------------------------------
  if (outage.mandatoryRestorationTime) {
    let mrt;
    if (typeof outage.mandatoryRestorationTime === 'string') {
      mrt = new Date(outage.mandatoryRestorationTime).getTime();
    } else {
      mrt = outage.mandatoryRestorationTime.getTime();
    }

    if (!isNaN(mrt)) {
      return resolutionTime <= mrt ? 'within' : 'out';
    }
  }

  // ---------------------------------------------------
  // 4. SLA PRIORITY #2 – Expected Restoration Time (ERT) in hours
  // ---------------------------------------------------
  if (outage.expectedResolutionHours && outage.expectedResolutionHours > 0) {
    const expectedMs = outage.expectedResolutionHours * 60 * 60 * 1000;
    return actualResolutionMs <= expectedMs ? 'within' : 'out';
  }

  // ---------------------------------------------------
  // 5. SLA PRIORITY #3 – Default SLA by alarm type
  // ---------------------------------------------------
  const defaultSLAs = {
    CRITICAL: 1,
    MAJOR: 2,
    MINOR: 4,
    WARNING: 8,
    INFO: 24
  };

  const type = (outage.alarmType || 'INFO').toUpperCase() as keyof typeof defaultSLAs;
  const defaultHours = defaultSLAs[type] || 24;
  const defaultMs = defaultHours * 60 * 60 * 1000;

  return actualResolutionMs <= defaultMs ? 'within' : 'out';
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
  mandatoryRestorationTime?: Date;
  supervisor: string;
  username: string;
  rootCause?: 'Generator' | 'Transmission' | 'Radio' | 'Environment' | 'Others';
  subrootCause?: string;
  status: 'In Progress' | 'Resolved';
  slaStatus?: 'within' | 'out' | 'unknown';
}

export const HourlyOutageReports: React.FC = () => {
  const [reports, setReports] = useState<NetworkPerformanceReport[]>([]);
  const [carryOverReports, setCarryOverReports] = useState<OutageItem[]>([]);
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
        mttr: 0,
        totalTickets: carryOverReports.length
      };
    }
    
    const currentReport = reports[0];
    const resolvedOutages = currentReport?.resolvedOutages || [];
    const ongoingOutages = currentReport?.ongoingOutages || [];
    
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
    
    // Total tickets = carry-over + ongoing + resolved
    const totalTickets = carryOverReports.length + ongoingOutages.length + resolvedOutages.length;
    
    return {
      totalResolved,
      withinSLA,
      outOfSLA,
      mttr,
      totalTickets,
      inProgressCount: carryOverReports.length + ongoingOutages.length // Include carry-over in progress count
    };
  }, [reports, carryOverReports]);

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
      
      // Safe date parsing function
      const safeDate = (dateStr: any) => {
        if (!dateStr) return undefined;
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? undefined : date;
      };
      
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
      
      console.log('🌐 Backend API response:', {
        ongoingCount: data.ongoingOutages?.length || 0,
        resolvedCount: data.resolvedOutages?.length || 0,
        ongoingSample: data.ongoingOutages?.[0],
        resolvedSample: data.resolvedOutages?.[0]
      });
      
      // Process the data to ensure all required fields are present
      const processedData = {
        ...data,
        resolvedOutages: data.resolvedOutages?.map((outage: any) => ({
          ...outage,
          // Ensure all required fields have default values if missing
          expectedRestorationTime: outage.expectedRestorationTime || null,
          mandatoryRestorationTime: outage.mandatoryRestorationTime || null,
          supervisor: outage.supervisor || 'N/A',
          username: outage.username || 'N/A',
          rootCause: outage.rootCause || 'N/A',
          subrootCause: outage.subrootCause || 'N/A',
          status: outage.status || 'Resolved',
          alarmType: outage.alarmType || 'INFO'
        })) || []
      };
      
      // Include resolved MAE alarms from the central Alarm collection
      const utcStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), 0, 0, 0, 0));
      const utcEnd = new Date(utcStart.getTime() + 24 * 60 * 60 * 1000);
      const resolvedUrl = `${import.meta.env.VITE_API_URL}/api/alarms?status=resolved&startDate=${utcStart.toISOString()}&endDate=${utcEnd.toISOString()}&limit=1000`;
      console.log('🛰️ Hourly: Fetching resolved alarms', { resolvedUrl, utcStart, utcEnd });
      const resolvedAlarmsResponse = await fetch(resolvedUrl);
      let resolvedAlarms: any[] = [];
      if (resolvedAlarmsResponse.ok) {
        const alarmsData = await resolvedAlarmsResponse.json();
        const beforeFilter = alarmsData.alarms?.length || 0;
        resolvedAlarms = (alarmsData.alarms || []).filter((a: any) => a.resolvedAt && new Date(a.resolvedAt) >= utcStart && new Date(a.resolvedAt) < utcEnd);
        console.log('✅ Hourly: Resolved alarms fetch', {
          httpStatus: resolvedAlarmsResponse.status,
          totalFromApi: beforeFilter,
          filteredForDay: resolvedAlarms.length,
          sample: resolvedAlarms.slice(0, 3).map((a) => ({
            id: a._id,
            resolvedAt: a.resolvedAt,
            description: a.description
          }))
        });
      } else {
        console.warn('⚠️ Hourly: Failed to fetch resolved alarms', {
          status: resolvedAlarmsResponse.status,
          statusText: resolvedAlarmsResponse.statusText
        });
      }

      // Since reports must include carry-overs, ensure we explicitly include unresolved from before today (use UTC boundaries)
      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      const endOfToday = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

      // Separate carry-over outages (unresolved from previous days) from API payload if present
      let carryOverOutages = processedData.ongoingOutages.filter((outage: any) => 
        new Date(outage.occurrenceTime) < todayStart
      );

      // Fetch unresolved outages that started before today to guarantee inclusion
      try {
        const carryFetch = await outageReportService.getOutageReports({
          endDate: todayStart.toISOString(),
          status: 'all',
          page: 1,
          limit: 1000
        });
        const unresolvedBeforeToday = carryFetch.reports.filter((r: any) => ['In Progress', 'Open'].includes(r.status));
        carryOverOutages = [...new Map([...carryOverOutages, ...unresolvedBeforeToday].map((o: any) => [o.id || o._id, o])).values()];
      } catch (e) {
        console.warn('Failed to enrich carry-over outages:', e);
      }

      // Pre-fetch site regions for all unique site IDs from MAE alarms
      const maeSiteIds = [...new Set(resolvedAlarms.map((a: any) => a.siteId))];
      console.log('Fetching regions for MAE site IDs:', maeSiteIds);
      
      // Pre-fetch all regions first
      await siteRegionService.fetchSiteRegionMap();

      // Process MAE alarms with region lookup
      const processedMaeAlarms = await Promise.all(resolvedAlarms.map(async (a: any) => {
        // Ensure we have a valid site ID
        const siteId = a.siteId?.trim();
        if (!siteId) {
          console.warn('Missing siteId in MAE alarm:', a);
          return null;
        }
        
        const region = await siteRegionService.getSiteRegion(siteId);
        console.log(`Region for site ${siteId}:`, region);
        
        return {
          id: a._id,
          siteNo: siteId,
          siteCode: a.siteName || siteId,
          region: region,
          alarmType: a.alarmType?.replace('MAE_', '') || 'INFO',
          occurrenceTime: a.timestamp,
          supervisor: 'N/A',
          rootCause: 'Others' as any,
          subrootCause: '',
          username: 'MAE Stream',
          resolutionTime: a.resolvedAt,
          expectedRestorationTime: undefined,
          mandatoryRestorationTime: a.resolvedAt || new Date(),
          status: 'Resolved' as const,
          createdAt: a.timestamp,
          updatedAt: a.resolvedAt || a.timestamp,
          reportHour: a.timestamp,
          isEmailSent: false,
          emailSentAt: undefined,
          slaStatus: 'within' as const,
          expectedResolutionHours: undefined,
          // Include MAE-specific fields for richer display
          alarmName: a.alarmName,
          category: a.category,
          neType: a.neType,
          neName: a.neName,
          description: a.description
        };
      }));

      // Filter out any null entries from processedMaeAlarms
      const validMaeAlarms = processedMaeAlarms.filter(Boolean);
      console.log(`Processed ${validMaeAlarms.length} valid MAE alarms`);
      
      // Deduplicate by ID across all sources
      const deduped = new Map();
      [
        ...validMaeAlarms,
        ...processedData.ongoingOutages,
        ...(processedData.resolvedOutages || []),
        ...carryOverOutages,
      ].forEach((o: any) => {
        const k = (o && (o.id || o._id)) || undefined;
        if (k) deduped.set(k, o);
      });
      const todaysOngoingOutages = processedData.ongoingOutages.filter((outage: any) => 
        new Date(outage.occurrenceTime) >= todayStart
      );

      // Update the processed data to only include today's ongoing
      processedData.ongoingOutages = todaysOngoingOutages;

      // Build a unified snapshot by fetching reports for [todayStart, endOfToday]
      let allOutages: any[] = [];
      try {
        const rangeFetch = await outageReportService.getOutageReports({
          startDate: todayStart.toISOString(),
          endDate: endOfToday.toISOString(),
          sortBy: 'occurrenceTime',
          sortOrder: 'asc',
          limit: 2000,
        });
        const byId: Record<string, any> = {};
        // Combine range + payload + carry-over fetch to be safe
        [
          ...rangeFetch.reports,
          ...processedData.ongoingOutages,
          ...(processedData.resolvedOutages || []),
          ...carryOverOutages,
        ].forEach((o: any) => {
          const k = (o && (o.id || o._id)) || undefined;
          if (k) byId[k] = o;
        });
        allOutages = Object.values(byId);
      } catch (e) {
        // Fallback: combine what we already have
        const byId: Record<string, any> = {};
        [
          ...processedData.ongoingOutages,
          ...(processedData.resolvedOutages || []),
          ...carryOverOutages,
        ].forEach((o: any) => {
          const k = (o && (o.id || o._id)) || undefined;
          if (k) byId[k] = o;
        });
        allOutages = Object.values(byId);
      }

      console.log('📦 All outages after merge:', {
        totalCount: allOutages.length,
        sample: allOutages.slice(0, 3).map(o => ({
          id: o.id || o._id,
          status: o.status,
          occurrenceTime: o.occurrenceTime,
          resolutionTime: o.resolutionTime
        }))
      });

      // Compute snapshot groups
      const isInProgress = (s: string) => s === 'In Progress' || s === 'Open';
      const isResolved = (s: string) => s === 'Resolved' || s === 'Closed';

      const carryOverUnified = allOutages.filter((o: any) => {
        const occ = new Date(o.occurrenceTime);
        return occ < todayStart && isInProgress(o.status);
      });

      const ongoingToday = allOutages.filter((o: any) => {
        const occ = new Date(o.occurrenceTime);
        return occ >= todayStart && isInProgress(o.status);
      });

      const resolvedToday = allOutages.filter((o: any) => {
        if (!isResolved(o.status) || !o.resolutionTime) return false;
        const rt = new Date(o.resolutionTime);
        const included = rt >= todayStart && rt < endOfToday;
        console.log('🔍 Checking resolved outage:', {
          id: o.id || o._id,
          status: o.status,
          occurrenceTime: o.occurrenceTime,
          resolutionTime: o.resolutionTime,
          resolutionTimeDate: rt,
          todayStart,
          endOfToday,
          included
        });
        return included;
      });

      console.log('📊 Resolved Today Summary:', {
        totalAllOutages: allOutages.length,
        resolvedTodayCount: resolvedToday.length,
        carryOverCount: carryOverUnified.length,
        ongoingTodayCount: ongoingToday.length
      });

      console.log('📋 ALL RESOLVED TODAY TICKETS:', resolvedToday.map(o => ({
        id: o.id || o._id,
        siteCode: o.siteCode,
        region: o.region,
        status: o.status,
        occurrenceTime: o.occurrenceTime,
        resolutionTime: o.resolutionTime,
        isCarryOver: new Date(o.occurrenceTime) < todayStart,
        durationHours: o.resolutionTime && o.occurrenceTime 
          ? ((new Date(o.resolutionTime).getTime() - new Date(o.occurrenceTime).getTime()) / (1000 * 60 * 60)).toFixed(2)
          : 'N/A'
      })));

      // Override processed data based on unified snapshot
      processedData.ongoingOutages = ongoingToday as any;
      processedData.resolvedOutages = resolvedToday as any;
      carryOverOutages = carryOverUnified;

      // Build Tickets Per Region from combined outages so carry-overs are included
      const combinedForRegion = [
        ...carryOverOutages,
        ...processedData.ongoingOutages,
        ...(processedData.resolvedOutages || [])
      ];

      const regionMap: Record<string, any> = {};
      combinedForRegion.forEach((o: any) => {
        const region = o.region || 'Unknown';
        if (!regionMap[region]) {
          regionMap[region] = {
            region,
            totalTickets: 0,
            inProgressTickets: 0,
            resolvedTickets: 0,
            withinSLATickets: 0,
            outOfSLATickets: 0,
            criticalAlarms: 0,
            majorAlarms: 0,
            minorAlarms: 0,
            carryOverCount: 0,
          };
        }
        const r = regionMap[region];
        r.totalTickets += 1;

        if (o.status === 'In Progress' || o.status === 'Open') r.inProgressTickets += 1;
        if (o.status === 'Resolved' || o.status === 'Closed') {
          r.resolvedTickets += 1;
          const sla = calculateSlaStatus(o);
          if (sla === 'within') r.withinSLATickets += 1;
          else if (sla === 'out') r.outOfSLATickets += 1;
        }

        // Severity via alarmType
        if (o.alarmType === 'CRITICAL') r.criticalAlarms += 1;
        if (o.alarmType === 'MAJOR') r.majorAlarms += 1;
        if (o.alarmType === 'MINOR') r.minorAlarms += 1;

        // Carry-over mark
        if (isInProgress(o.status) && new Date(o.occurrenceTime) < todayStart) {
          r.carryOverCount += 1;
        }
      });

      processedData.ticketsPerRegion = Object.values(regionMap);

      setReports([processedData]);
      setCarryOverReports(carryOverOutages as any);
    } catch (err) {
      console.error('Failed to fetch hourly reports:', err);
      setError(err instanceof Error ? err.message : 'Failed to load hourly reports');
      setReports([]);
      setCarryOverReports([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (date: Date | string | null | undefined) => {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';
    
    // Format date as 10/Nov/2025
    const day = d.getDate().toString().padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[d.getMonth()];
    const year = d.getFullYear();
    
    // Format time as 02:44 PM
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12; // Convert 0 to 12 for 12-hour format
    
    return `${day}/${month}/${year} ${displayHours}:${minutes} ${ampm}`;
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
          <h2 className="text-2xl font-bold text-foreground">Hourly Outage Report</h2>
          <div className="text-sm text-muted-foreground">
            Generated on {new Date().toLocaleString('en-US', {
              month: '2-digit',
              day: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            })} • {metrics.inProgressCount} Active Outages • {currentReport?.resolvedOutages?.length || 0} Resolved Today
          </div>
        </div>
        <p className="text-muted-foreground text-sm mt-1">View comprehensive daily outage reports with all active and historical outages from today</p>
      </div>

      {/* No date/hour selector needed - shows current day's cumulative report */}
      <div className="bg-card rounded-lg p-6 border border-border mb-6">
        <div className="text-center">
          <p className="text-muted-foreground">Showing all outages from today ({new Date().toLocaleDateString()})</p>
          <p className="text-sm text-muted-foreground mt-1">Reports are generated hourly throughout the day</p>
        </div>
      </div>

      {currentReport && (
        <>
          {/* Metrics Cards */}
          <div className="flex flex-nowrap overflow-x-auto pb-4 -mx-2 px-2">
            <div className="flex-none w-64 mx-2 bg-card rounded-lg p-6 border border-border shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase opacity-90 text-foreground">Total Tickets</h3>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 opacity-80 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </div>
              <div className="text-4xl font-bold mb-1 text-foreground">
                {metrics.totalTickets}
              </div>
              <p className="text-sm opacity-80 text-muted-foreground">Issues reported today</p>
            </div>

            <div className="flex-none w-64 mx-2 bg-card rounded-lg p-6 border border-border shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase opacity-90 text-foreground">In Progress</h3>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 opacity-80 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 6v6l4 2"></path>
                </svg>
              </div>
              <div className="text-4xl font-bold mb-1 text-foreground">
                {metrics.inProgressCount}
              </div>
              <p className="text-sm opacity-80 text-muted-foreground">Active issues being resolved</p>
            </div>

            <div className="flex-none w-64 mx-2 bg-card rounded-lg p-6 border border-border shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase opacity-90 text-foreground">Total Resolved</h3>
                <CheckCircle className="w-8 h-8 opacity-80 text-primary" />
              </div>
              <div className="text-4xl font-bold mb-1 text-foreground">{metrics.totalResolved}</div>
              <p className="text-sm opacity-80 text-muted-foreground">Resolved today</p>
            </div>

            <div className="flex-none w-64 mx-2 bg-card rounded-lg p-6 border border-border shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase opacity-90 text-foreground">Within SLA</h3>
                <TrendingUp className="w-8 h-8 opacity-80 text-primary" />
              </div>
              <div className="text-4xl font-bold mb-1 text-foreground">{metrics.withinSLA}</div>
              <p className="text-sm opacity-80 text-muted-foreground">
                {metrics.totalResolved > 0
                  ? Math.round((metrics.withinSLA / metrics.totalResolved) * 100)
                  : 0}% compliance
              </p>
            </div>

            <div className="flex-none w-64 mx-2 bg-card rounded-lg p-6 border border-border shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase opacity-90 text-foreground">Out of SLA</h3>
                <XCircle className="w-8 h-8 opacity-80 text-primary" />
              </div>
              <div className="text-4xl font-bold mb-1 text-foreground">{metrics.outOfSLA}</div>
              <p className="text-sm opacity-80 text-muted-foreground">
                {metrics.totalResolved > 0
                  ? Math.round((metrics.outOfSLA / metrics.totalResolved) * 100)
                  : 0}% breached
              </p>
            </div>

            <div className="flex-none w-64 mx-2 bg-card rounded-lg p-6 border border-border shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase opacity-90 text-foreground">MTTR</h3>
                <Clock className="w-8 h-8 opacity-80 text-primary" />
              </div>
              <div className="text-4xl font-bold mb-1 text-foreground">{metrics.mttr || 'N/A'}</div>
              <p className="text-sm opacity-80 text-muted-foreground">Minutes (avg)</p>
            </div>
          </div>

          {/* Carry-Over Outages Section */}
          <div className="bg-card rounded-lg border-2 border-border overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-border bg-accent/20">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🟡</span>
                <div>
                  <h3 className="text-xl font-bold text-foreground">Carry-Over Outages (Unresolved from Previous Days)</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {carryOverReports.length > 0 
                      ? `${carryOverReports.length} incident${carryOverReports.length !== 1 ? 's' : ''} from before today still pending resolution`
                      : 'No carry-over outages from previous days'
                    }
                  </p>
                </div>
              </div>
            </div>

            {carryOverReports.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Site No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Site Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Region</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Alarm Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Occurrence Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Days Open</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Expected Restoration Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Mandatory Restoration Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Supervisor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Root Cause</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Subroot Cause</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Username</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Actual Resolution</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carryOverReports
                      .filter(report => report && report.id && typeof report === 'object')
                      .map((report) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const daysOpen = Math.floor((today.getTime() - new Date(report.occurrenceTime).getTime()) / (1000 * 60 * 60 * 24));
                        return (
                          <tr key={report.id} className="border-b border-border hover:bg-accent">
                            <td className="px-4 py-3 text-sm text-foreground">{report.siteNo || 'N/A'}</td>
                            <td className="px-4 py-3 text-sm text-foreground">{report.siteCode || 'Unknown'}</td>
                            <td className="px-4 py-3 text-sm text-foreground">{report.region || 'Unknown'}</td>
                            <td className={`px-4 py-3 text-sm ${getAlarmTypeColor(report.alarmType)}`}>
                              {report.alarmType || 'Unknown'}
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">
                              {report.occurrenceTime ? formatDateTime(report.occurrenceTime) : 'Unknown'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold ${daysOpen > 3 ? 'bg-red-900 text-red-200' : daysOpen > 1 ? 'bg-orange-900 text-orange-200' : 'bg-yellow-900 text-yellow-200'}`}>
                                {daysOpen} day{daysOpen !== 1 ? 's' : ''}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">
                              <span className="text-primary font-semibold">
                                {report.expectedRestorationTime ? formatDateTime(report.expectedRestorationTime) : 'Not set'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">
                              <span className="text-red-400 font-semibold">
                                {report.mandatoryRestorationTime ? formatDateTime(report.mandatoryRestorationTime) : 'Not set'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">{report.supervisor || 'N/A'}</td>
                            <td className="px-4 py-3 text-sm text-foreground">
                              <span className="italic text-yellow-300">{report.rootCause || 'Under Investigation'}</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">
                              <span className="italic text-yellow-300">{report.subrootCause || 'N/A'}</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">
                              <span className="text-purple-300">{report.username || 'N/A'}</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">
                              <span className="text-gray-500 italic">Not Resolved Yet</span>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(report.status)}`}>
                                {report.status}
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
                <p className="text-yellow-300">✅ No carry-over outages from previous days</p>
                <p className="text-sm text-yellow-200/70 mt-2">All ongoing outages are from today</p>
              </div>
            )}
          </div>

          {/* Ongoing Outages Section */}
          <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-destructive/10">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  <h3 className="text-xl font-bold text-foreground">
                    🔴 Today's Ongoing Outages ({currentReport.ongoingOutages.length})
                  </h3>
                </div>
              </div>

            {currentReport.ongoingOutages.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Site No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Site Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Region</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Alarm Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Occurrence Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Expected Restoration Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Mandatory Restoration Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Supervisor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Root Cause</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Subroot Cause</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Username</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Actual Resolution</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReport.ongoingOutages.map((outage) => (
                    <tr key={outage.id} className="border-b border-border hover:bg-accent">
                      <td className="px-4 py-3 text-sm text-foreground">{outage.siteNo}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{outage.siteCode}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{outage.region}</td>
                      <td className={`px-4 py-3 text-sm ${getAlarmTypeColor(outage.alarmType)}`}>
                        {outage.alarmType}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {formatDateTime(outage.occurrenceTime)}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <span className="text-primary font-semibold">
                          {outage.expectedRestorationTime ? formatDateTime(outage.expectedRestorationTime) : 'Not set'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <span className="text-red-400 font-semibold">
                          {outage.mandatoryRestorationTime ? formatDateTime(outage.mandatoryRestorationTime) : 'Not set'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{outage.supervisor}</td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <span className="italic text-yellow-300">{outage.rootCause || 'Under Investigation'}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <span className="italic text-yellow-300">{outage.subrootCause || 'N/A'}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <span className="text-purple-300">{outage.username || 'N/A'}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
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
                <p className="text-muted-foreground">✅ No ongoing outages in the system</p>
              </div>
            )}
          </div>

          {/* Resolved Outages Section */}
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-success/10">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <h3 className="text-xl font-bold text-foreground">
                  ✅ All Resolved/Closed Outages ({currentReport.resolvedOutages.length})
                </h3>
              </div>
            </div>

            {currentReport.resolvedOutages.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Site No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Site Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Region</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Alarm Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Occurrence Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Expected Restoration Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Mandatory Restoration Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Actual Resolution Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">SLA Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Root Cause</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Subroot Cause</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Username</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Supervisor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReport.resolvedOutages.map((outage) => {
                      // Use stored SLA status from backend if available, otherwise calculate
                      const slaStatus = outage.slaStatus || calculateSlaStatus(outage);
                      console.log('🔍 SLA Status for outage:', {
                        id: outage.id,
                        storedSLA: outage.slaStatus,
                        calculatedSLA: calculateSlaStatus(outage),
                        finalSLA: slaStatus,
                        mrt: outage.mandatoryRestorationTime,
                        mrtType: typeof outage.mandatoryRestorationTime,
                        mrtValue: outage.mandatoryRestorationTime,
                        mrtIsNull: outage.mandatoryRestorationTime === null,
                        mrtIsUndefined: outage.mandatoryRestorationTime === undefined,
                        mrtIsEmptyString: typeof outage.mandatoryRestorationTime === 'string' && outage.mandatoryRestorationTime === '',
                        resolutionTime: outage.resolutionTime,
                        allFields: Object.keys(outage)
                      });
                      let statusText = 'N/A';
                      let statusColor = 'text-gray-400';

                      // More descriptive status messages
                      if (!outage.resolutionTime) {
                        statusText = '⏳ Not Resolved';
                        statusColor = 'text-yellow-400';
                      } else if (!outage.mandatoryRestorationTime && !outage.expectedResolutionHours && !outage.expectedRestorationTime) {
                        statusText = 'ℹ️ SLA Not Set';
                        statusColor = 'text-blue-400';
                      } else if (slaStatus === 'within') {
                        statusText = '✅ Within SLA';
                        statusColor = 'text-green-500';
                      } else if (slaStatus === 'out') {
                        const endTimeFormatted = outage.resolutionTime ? formatDateTime(outage.resolutionTime) : 'N/A';
                        const mandatoryTimeFormatted = outage.mandatoryRestorationTime ? formatDateTime(outage.mandatoryRestorationTime) : 'N/A';
                        statusText = `❌ Out of SLA (${endTimeFormatted} > ${mandatoryTimeFormatted})`;
                        statusColor = 'text-red-500';
                      } else if (slaStatus === 'unknown') {
                        statusText = '❓ SLA Unknown';
                        statusColor = 'text-orange-400';
                      }

                      return (
                      <tr key={outage.id} className="border-b border-border hover:bg-accent">
                        <td className="px-4 py-3 text-sm text-foreground">{outage.siteNo}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{outage.siteCode}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{outage.region}</td>
                        <td className={`px-4 py-3 text-sm ${getAlarmTypeColor(outage.alarmType)}`}>
                          {outage.alarmType}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {formatDateTime(outage.occurrenceTime)}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          <span className="text-primary font-semibold">
                            {outage.expectedRestorationTime ? formatDateTime(outage.expectedRestorationTime) : 'Not set'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          <span className="text-red-400 font-semibold">
                            {outage.mandatoryRestorationTime ? formatDateTime(outage.mandatoryRestorationTime) : 'Not set'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {outage.resolutionTime ? formatDateTime(outage.resolutionTime) : 'N/A'}
                        </td>
                        <td className={`px-4 py-3 text-sm ${statusColor}`}>
                          {statusText}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {outage.rootCause || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {outage.subrootCause || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          <span className="text-purple-300">{outage.username || 'N/A'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">{outage.supervisor}</td>
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
                <p className="text-muted-foreground">No outages have been resolved in the system</p>
              </div>
            )}
          </div>

          {/* Tickets Per Region - Moved below Resolved Outages */}
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-primary/10">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-bold text-foreground">
                  📊 Tickets Per Region ({(currentReport.ticketsPerRegion || []).length} regions)
                </h3>
              </div>
            </div>

            {(currentReport.ticketsPerRegion || []).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Region</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Total Tickets</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">In Progress</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Resolved</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Within SLA</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Out of SLA</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Critical</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Major</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Minor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReport.ticketsPerRegion.map((regionData, index) => (
                      <tr key={`${regionData.region}-${index}`} className="border-b border-border hover:bg-accent">
                        <td className="px-4 py-3 text-sm font-semibold text-foreground">{regionData.region}</td>
                        <td className="px-4 py-3 text-sm text-primary font-bold">{regionData.totalTickets}</td>
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
                <p className="text-muted-foreground">No regional ticket data available</p>
              </div>
            )}
          </div>
        </>
      )}

      {!currentReport && !loading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No network performance data available</p>
        </div>
      )}
    </div>
  );
};
