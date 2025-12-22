import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { outageReportService, DailyReportsResponse, OutageReport } from '../services/outageReportService';
import { siteRegionService } from '../services/siteRegionService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AlertCircle, CheckCircle, Download, RefreshCw } from 'lucide-react';

// Add type for tab state
type TabType = 'ongoing' | 'resolved';

// Add type for report status
type ReportStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

// Define autoTable options interface
interface AutoTableOptions {
  head: string[][];
  body: any[][];
  startY?: number;
  theme?: string;
  headStyles?: {
    fillColor?: number[];
    textColor?: number;
    fontStyle?: string;
  };
  styles?: {
    fontSize?: number;
    cellPadding?: number;
    overflow?: string;
  };
  columnStyles?: {
    [key: number]: {
      cellWidth?: number | 'wrap' | 'auto';
      minCellWidth?: number;
      minCellHeight?: number;
      valign?: 'middle' | 'top' | 'bottom';
      halign?: 'left' | 'center' | 'right' | 'justify';
    };
  };
}

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: AutoTableOptions) => jsPDF;
    lastAutoTable?: {
      finalY: number;
    };
  }
}

const DailyReports: React.FC = () => {
  const [dailyReports, setDailyReports] = useState<DailyReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<TabType>('ongoing');
  
  // Filter reports based on status and carry-over logic
  const { ongoingOutages, resolvedOutages, carryOverOutages } = useMemo(() => {
    const reports = dailyReports?.allReports || [];
    const selectedDateStart = new Date(selectedDate);
    selectedDateStart.setHours(0, 0, 0, 0);
    const selectedDateEnd = new Date(selectedDateStart.getTime() + 24 * 60 * 60 * 1000);
    const isInProgress = (s: string) => s === 'In Progress' || s === 'Open';
    const isResolved = (s: string) => s === 'Resolved' || s === 'Closed';

    return {
      carryOverOutages: reports.filter((report: OutageReport) => 
        new Date(report.occurrenceTime) < selectedDateStart && isInProgress(report.status as string)
      ),
      ongoingOutages: reports.filter((report: OutageReport) => 
        new Date(report.occurrenceTime) >= selectedDateStart && isInProgress(report.status as string)
      ),
      resolvedOutages: reports.filter((report: OutageReport) => {
        if (!isResolved(report.status as string) || !report.resolutionTime) return false;
        const rt = new Date(report.resolutionTime);
        return rt >= selectedDateStart && rt < selectedDateEnd;
      })
    };
  }, [dailyReports, selectedDate]);
  
  // Helper functions for formatting and styling
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
  
  const getSlaStatus = (report: OutageReport) => {
    if (!report.resolutionTime || !report.occurrenceTime) {
      return { status: 'N/A', color: 'text-gray-400' };
    }
    
    const resolutionTime = new Date(report.resolutionTime).getTime();
    const occurrenceTime = new Date(report.occurrenceTime).getTime();
    const durationHours = (resolutionTime - occurrenceTime) / (1000 * 60 * 60);
    
    return {
      status: durationHours <= 2 ? '✅ Within SLA' : '❌ Out of SLA',
      color: durationHours <= 2 ? 'text-green-500' : 'text-red-500'
    };
  };

  useEffect(() => {
    const fetchDailyReports = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await outageReportService.getDailyReports(selectedDate);
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

        const rangeFetch = await outageReportService.getOutageReports({
          startDate: startOfDay.toISOString(),
          endDate: endOfDay.toISOString(),
          page: 1,
          limit: 1000
        });

        // Include resolved MAE alarms from the central Alarm collection
        const resolvedUrl = `${import.meta.env.VITE_API_URL}/api/alarms?status=resolved&startDate=${startOfDay.toISOString()}&endDate=${endOfDay.toISOString()}&limit=1000`;
        console.log('🛰️ Daily: Fetching resolved alarms', { resolvedUrl, startOfDay, endOfDay });
        const resolvedAlarmsResponse = await fetch(resolvedUrl);
        let resolvedAlarms: any[] = [];
        if (resolvedAlarmsResponse.ok) {
          const alarmsData = await resolvedAlarmsResponse.json();
          const beforeFilter = alarmsData.alarms?.length || 0;
          resolvedAlarms = (alarmsData.alarms || []).filter((a: any) => a.resolvedAt && new Date(a.resolvedAt) >= startOfDay && new Date(a.resolvedAt) < endOfDay);
          
          // Pre-fetch site regions for all unique site IDs
          const siteIds = [...new Set(resolvedAlarms.map((a: any) => a.siteId))];
          await siteRegionService.fetchSiteRegionMap();
          
          console.log('✅ Daily: Resolved alarms fetch', {
            httpStatus: resolvedAlarmsResponse.status,
            totalFromApi: beforeFilter,
            filteredForDay: resolvedAlarms.length,
            uniqueSites: siteIds.length,
            sample: resolvedAlarms.slice(0, 3).map((a) => ({
              id: a._id,
              siteId: a.siteId,
              resolvedAt: a.resolvedAt,
              description: a.description
            }))
          });
        } else {
          console.warn('⚠️ Daily: Failed to fetch resolved alarms', {
            status: resolvedAlarmsResponse.status,
            statusText: resolvedAlarmsResponse.statusText
          });
        }

        // Process resolved alarms with region lookup
        const processedAlarms = await Promise.all(resolvedAlarms.map(async (a: any) => {
          const region = await siteRegionService.getSiteRegion(a.siteId);
          return {
            id: a._id,
            siteNo: a.siteId,
            siteCode: a.siteName,
            region: region || 'Unknown' as any,
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

        const allOutages = [
          ...rangeFetch.reports,
          ...processedAlarms
        ];

        console.log('🌐 Daily: Backend API response:', {
          totalFetched: rangeFetch.reports.length,
          dateRange: { startOfDay, endOfDay },
          sample: rangeFetch.reports.slice(0, 3).map((r: any) => ({
            id: r.id || r._id,
            status: r.status,
            occurrenceTime: r.occurrenceTime,
            resolutionTime: r.resolutionTime
          }))
        });

        const isInProgress = (s: string) => s === 'In Progress' || s === 'Open';
        const isResolved = (s: string) => s === 'Resolved' || s === 'Closed';

        const carryOver = allOutages.filter(r => (r.occurrenceTime as any) < startOfDay && isInProgress(r.status as string));
        const ongoingToday = allOutages.filter(r => (r.occurrenceTime as any) >= startOfDay && isInProgress(r.status as string));
        const resolvedToday = allOutages.filter(r => {
          if (!isResolved(r.status as string) || !r.resolutionTime) return false;
          const rt = r.resolutionTime as any as Date;
          const included = rt >= startOfDay && rt < endOfDay;
          console.log('🔍 Daily: Checking resolved outage:', {
            id: r.id || (r as any)._id,
            status: r.status,
            occurrenceTime: r.occurrenceTime,
            resolutionTime: r.resolutionTime,
            resolutionTimeDate: rt,
            startOfDay,
            endOfDay,
            included
          });
          return included;
        });

        console.log('📊 Daily Resolved Today Summary:', {
          totalAllOutages: allOutages.length,
          resolvedTodayCount: resolvedToday.length,
          carryOverCount: carryOver.length,
          ongoingTodayCount: ongoingToday.length
        });

        console.log('📋 DAILY: ALL RESOLVED TODAY TICKETS:', resolvedToday.map(r => ({
          id: r.id || (r as any)._id,
          siteCode: r.siteCode,
          region: r.region,
          status: r.status,
          occurrenceTime: r.occurrenceTime,
          resolutionTime: r.resolutionTime,
          isCarryOver: (r.occurrenceTime as any) < startOfDay,
          durationHours: r.resolutionTime && r.occurrenceTime 
            ? ((new Date(r.resolutionTime as any).getTime() - new Date(r.occurrenceTime as any).getTime()) / (1000 * 60 * 60)).toFixed(2)
            : 'N/A'
        })));

        const regionMap: Record<string, any> = {};
        const combinedForRegion = [...carryOver, ...ongoingToday, ...resolvedToday];
        const calcSlaStatus = (r: OutageReport): 'within' | 'out' | 'unknown' => {
          if ((r as any).slaStatus) return ((r as any).slaStatus as any) || 'unknown';
          if (!r.resolutionTime || !r.occurrenceTime) return 'unknown';
          const resolutionTime = new Date(r.resolutionTime).getTime();
          const occurrenceTime = new Date(r.occurrenceTime).getTime();
          if (r.mandatoryRestorationTime) {
            const mandatory = new Date(r.mandatoryRestorationTime).getTime();
            return resolutionTime <= mandatory ? 'within' : 'out';
          }
          const thresholds: Record<string, number> = { CRITICAL: 60, MAJOR: 120, MINOR: 240, WARNING: 480, INFO: 1440 };
          const minutes = Math.round((resolutionTime - occurrenceTime) / 60000);
          const alarm = (r.alarmType as string) || 'INFO';
          const th = thresholds[alarm] ?? 240;
          return minutes <= th ? 'within' : 'out';
        };

        combinedForRegion.forEach((o: any) => {
          const region = o.region || 'Unknown';
          if (!regionMap[region]) {
            regionMap[region] = {
              region,
              totalTickets: 0,
              openTickets: 0,
              inProgressTickets: 0,
              resolvedTickets: 0,
              withinSLATickets: 0,
              outOfSLATickets: 0,
              criticalAlarms: 0,
              majorAlarms: 0,
              minorAlarms: 0,
            };
          }
          const r = regionMap[region];
          r.totalTickets += 1;
          if (o.status === 'Open') r.openTickets += 1;
          if (o.status === 'In Progress') r.inProgressTickets += 1;
          if (o.status === 'Resolved' || o.status === 'Closed') {
            r.resolvedTickets += 1;
            const sla = calcSlaStatus(o);
            if (sla === 'within') r.withinSLATickets += 1;
            else if (sla === 'out') r.outOfSLATickets += 1;
          }
          if (o.alarmType === 'CRITICAL') r.criticalAlarms += 1;
          if (o.alarmType === 'MAJOR') r.majorAlarms += 1;
          if (o.alarmType === 'MINOR') r.minorAlarms += 1;
        });

        const totalReports = allOutages.length;
        const totalOpen = allOutages.filter(r => (r.status as string) === 'Open').length;
        const totalInProgress = allOutages.filter(r => (r.status as string) === 'In Progress').length;
        const totalResolved = resolvedToday.length;
        let totalResolutionMinutes = 0;
        resolvedToday.forEach(r => {
          if (r.resolutionTime && r.occurrenceTime) {
            totalResolutionMinutes += Math.round((new Date(r.resolutionTime).getTime() - new Date(r.occurrenceTime).getTime()) / 60000);
          }
        });
        const mttr = resolvedToday.length > 0 ? Math.round(totalResolutionMinutes / resolvedToday.length) : 0;

        setDailyReports({
          ...data,
          summary: {
            totalReports,
            totalOpen,
            totalInProgress,
            totalResolved,
            mttr
          },
          ticketsPerRegion: Object.values(regionMap),
          allReports: allOutages,
          ongoingOutages: ongoingToday as any,
          resolvedOutages: resolvedToday as any,
        });
      } catch (err) {
        console.error('Failed to fetch daily reports:', err);
        setError(err instanceof Error ? err.message : 'Failed to load daily reports');
      } finally {
        setLoading(false);
      }
    };

    fetchDailyReports();
  }, [selectedDate]);

  const exportToPDF = (): void => {
    if (!dailyReports) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let currentY = 20;
    
    // Header
    doc.setFontSize(20);
    doc.text('Daily Outage Report', pageWidth / 2, currentY, { align: 'center' });
    
    doc.setFontSize(12);
    currentY += 10;
    doc.text(`Report Date: ${new Date(dailyReports.reportDate).toLocaleDateString()}`, pageWidth / 2, currentY, { align: 'center' });
    
    // Summary section
    currentY += 20;
    doc.setFontSize(16);
    doc.text('Summary', 20, currentY);
    
    const summaryData = [
      ['Total Tickets', dailyReports.summary.totalReports.toString()],
      ['Resolved', dailyReports.summary.totalResolved.toString()],
      ['In Progress', dailyReports.summary.totalInProgress.toString()],
      ['Performance (%)', dailyReports.summary.totalReports > 0
        ? Math.round((dailyReports.summary.totalResolved / dailyReports.summary.totalReports) * 100).toString()
        : '0'],
      ['MTTR (minutes)', dailyReports.summary.mttr.toString()]
    ];

    // Add summary table
    autoTable(doc, {
      startY: currentY + 5,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 40 }
      }
    });

    // Update Y position after summary table
    currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 15;
    
    // Add Root Cause Breakdown
    doc.setFontSize(16);
    doc.text('Root Cause Breakdown', 20, currentY);
    
    // Define root cause data with proper typing
    interface RootCauseData {
      rootCause: string;
      count: number;
      percentage: string;
    }
    
    const rootCauseData: RootCauseData[] = dailyReports.alarmsByRootCause.map(rc => ({
      rootCause: rc.rootCause,
      count: rc.count,
      percentage: `${((rc.count / dailyReports.summary.totalReports) * 100).toFixed(1)}%`
    }));
    
    // Add root cause table
    autoTable(doc, {
      startY: currentY + 5,
      head: [['Root Cause', 'Count', 'Percentage']],
      body: rootCauseData.map(rc => [rc.rootCause, rc.count, rc.percentage]),
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 30 },
        2: { cellWidth: 40 }
      }
    });
    
    // Update Y position after root cause table
    currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 15;

    // Update Y position after root cause table
    currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 20;

    // Add Region Breakdown
    doc.setFontSize(16);
    doc.text('Region Breakdown', 20, currentY);

    const regionData = dailyReports.ticketsPerRegion.map(region => {
      // Debug log the raw region data
      console.log('Processing region:', {
        id: region._id,
        name: region.region,
        resolved: region.resolvedTickets,
        withinSLATickets: region.withinSLATickets,
        within_sla: region.within_sla,
        outOfSLATickets: region.outOfSLATickets,
        out_of_sla: region.out_of_sla,
        raw: region
      });

      // Calculate SLA metrics - use either camelCase or snake_case, whichever is available
      const withinSLA = Number(region.withinSLATickets || region.within_sla || 0);
      const outOfSLA = Number(region.outOfSLATickets || region.out_of_sla || 0);
      
      return {
        region: region.region || region._id || 'Unknown',
        total: Number(region.totalTickets || 0),
        inProgress: Number(region.inProgressTickets || 0),
        resolved: Number(region.resolvedTickets || 0),
        withinSLA,
        outOfSLA,
        // Include raw data for debugging
        _raw: region
      };
    });
    
    console.log('Processed region data:', regionData);

    autoTable(doc, {
      startY: currentY + 10,
      head: [['Region', 'Total', 'In Progress', 'Resolved', 'Within SLA', 'Out of SLA']],
      body: regionData.map(r => [
        r.region,
        r.total,
        r.inProgress,
        r.resolved,
        r.withinSLA,
        r.outOfSLA
      ]),
      theme: 'grid',
      headStyles: { fillColor: [153, 102, 255] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 15 },
        2: { cellWidth: 20 },
        3: { cellWidth: 20 },
        4: { cellWidth: 20 },
        5: { cellWidth: 20 }
      }
    });

    // Update Y position after region table
    currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 20;

    // Add Carry-Over Outages
    if (carryOverOutages.length > 0) {
      doc.setFontSize(16);
      doc.text('Carry-Over Outages (Unresolved from Previous Days)', 20, currentY);

      const carryOverOutagesData = carryOverOutages.map(outage => [
        outage.siteNo,
        outage.siteCode,
        outage.region,
        outage.alarmType,
        formatDateTime(outage.occurrenceTime),
        Math.floor((new Date(selectedDate).getTime() - new Date(outage.occurrenceTime).getTime()) / (1000 * 60 * 60 * 24)).toString() + ' days',
        formatDateTime(outage.expectedRestorationTime || outage.mandatoryRestorationTime),
        outage.rootCause,
        outage.status
      ]);

      autoTable(doc, {
        startY: currentY + 10,
        head: [['Site No', 'Site Code', 'Region', 'Alarm Type', 'Occurrence Time', 'Days Open', 'Expected Restoration', 'Root Cause', 'Status']],
        body: carryOverOutagesData,
        theme: 'grid',
        headStyles: { fillColor: [255, 193, 7] },
        styles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 15 },
          2: { cellWidth: 20 },
          3: { cellWidth: 15 },
          4: { cellWidth: 25 },
          5: { cellWidth: 15 },
          6: { cellWidth: 25 },
          7: { cellWidth: 25 },
          8: { cellWidth: 15 }
        },
        margin: { top: 20 }
      });
      currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 10;
    }

    // Add Ongoing Outages
    doc.setFontSize(16);
    doc.text('Ongoing Outages', 20, currentY);

    const ongoingOutagesData = ongoingOutages.map(outage => [
      outage.siteNo,
      outage.siteCode,
      outage.region,
      outage.alarmType,
      formatDateTime(outage.occurrenceTime),
      formatDateTime(outage.expectedRestorationTime || outage.mandatoryRestorationTime),
      outage.rootCause,
      outage.status
    ]);

    if (ongoingOutages.length > 0) {
      autoTable(doc, {
        startY: currentY + 10,
        head: [['Site No', 'Site Code', 'Region', 'Alarm Type', 'Occurrence Time', 'Expected Restoration', 'Root Cause', 'Status']],
        body: ongoingOutagesData,
        theme: 'grid',
        headStyles: { fillColor: [255, 99, 132] },
        styles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 15 },
          2: { cellWidth: 20 },
          3: { cellWidth: 15 },
          4: { cellWidth: 25 },
          5: { cellWidth: 25 },
          6: { cellWidth: 25 },
          7: { cellWidth: 15 }
        },
        margin: { top: 20 }
      });
      currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 10;
    } else {
      doc.setFontSize(12);
      doc.text('No ongoing outages', 20, currentY + 15);
      currentY += 20;
    }

    // Add Resolved Outages
    doc.addPage();
    currentY = 20;
    doc.setFontSize(16);
    doc.text('Resolved Outages', 20, currentY);

    const resolvedOutagesData = resolvedOutages.map(outage => [
      outage.siteNo,
      outage.siteCode,
      outage.region,
      outage.alarmType,
      formatDateTime(outage.occurrenceTime),
      formatDateTime(outage.resolutionTime),
      getSlaStatus(outage).status,
      outage.rootCause
    ]);

    if (resolvedOutages.length > 0) {
      autoTable(doc, {
        startY: currentY + 10,
        head: [['Site No', 'Site Code', 'Region', 'Alarm Type', 'Occurrence Time', 'Resolution Time', 'SLA Status', 'Root Cause']],
        body: resolvedOutagesData,
        theme: 'grid',
        headStyles: { fillColor: [54, 162, 235] },
        styles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 15 },
          2: { cellWidth: 20 },
          3: { cellWidth: 15 },
          4: { cellWidth: 25 },
          5: { cellWidth: 25 },
          6: { cellWidth: 20 },
          7: { cellWidth: 25 }
        },
        margin: { top: 20 }
      });
    } else {
      doc.setFontSize(12);
      doc.text('No resolved outages', 20, currentY + 15);
    }

    // Save the PDF
    doc.save(`daily-report-${selectedDate}.pdf`);
  };

  // Loading State
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-2" />
          <div className="text-gray-400">Loading daily reports...</div>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  // No Data State
  if (!dailyReports) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">No data available for the selected date</div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-foreground">Daily Reports</h1>
          <div className="flex items-center space-x-4">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-background border border-input rounded px-3 py-2 text-sm text-foreground"
            />
            <button
              onClick={exportToPDF}
              className="px-4 py-2 rounded flex items-center space-x-2"
              disabled={!dailyReports}
            >
              <Download className="w-4 h-4" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        {/* Summary Stats Cards - Horizontal Scrollable */}
        <div className="mb-6">
          <div className="flex overflow-x-auto pb-2 -mx-2">
            <div className="flex flex-nowrap gap-4 px-2">
              {/* Total Tickets Card */}
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Tickets</p>
                    <p className="text-2xl font-bold text-foreground">{dailyReports?.summary.totalReports || 0}</p>
                  </div>
                  <div className="p-3 rounded-full bg-blue-900/30">
                    <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Resolved Card */}
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Resolved</p>
                    <p className="text-2xl font-bold text-green-400">{dailyReports?.summary.totalResolved || 0}</p>
                    <p className="text-xs text-green-400">
                      {dailyReports?.summary.totalReports ? 
                        `${Math.round((dailyReports.summary.totalResolved / dailyReports.summary.totalReports) * 100)}% of total` : 
                        '0% of total'}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-green-900/30">
                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* In Progress Card */}
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                    <p className="text-2xl font-bold text-yellow-400">{dailyReports?.summary.totalInProgress || 0}</p>
                    <p className="text-xs text-yellow-400">
                      {dailyReports?.summary.totalReports ? 
                        `${Math.round((dailyReports.summary.totalInProgress / dailyReports.summary.totalReports) * 100)}% of total` : 
                        '0% of total'}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-yellow-900/30">
                    <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* MTTR Card */}
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">MTTR (minutes)</p>
                    <p className="text-2xl font-bold text-purple-400">{dailyReports?.summary.mttr ? Math.round(dailyReports.summary.mttr) : 'N/A'}</p>
                    <p className="text-xs text-muted-foreground">Mean Time To Resolve</p>
                  </div>
                  <div className="p-3 rounded-full bg-purple-900/30">
                    <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Outages Section */}
        <div className="space-y-6">
        {/* Carry-Over Outages Section */}
        {carryOverOutages.length > 0 && (
          <div className="bg-card rounded-lg border-2 border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-accent/20">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🟡</span>
                <div>
                  <h3 className="text-xl font-bold text-foreground">Carry-Over Outages (Unresolved from Previous Days)</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {carryOverOutages.length} incident{carryOverOutages.length !== 1 ? 's' : ''} from before {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} still pending resolution
                  </p>
                </div>
              </div>
            </div>

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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Root Cause</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {carryOverOutages.map((outage) => {
                    const selectedDateStart = new Date(selectedDate);
                    selectedDateStart.setHours(0, 0, 0, 0);
                    const daysOpen = Math.floor((selectedDateStart.getTime() - new Date(outage.occurrenceTime).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={`carry-over-${outage.id}`} className="border-b border-border hover:bg-accent">
                        <td className="px-4 py-3 text-sm text-foreground">{outage.siteNo}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{outage.siteCode}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{outage.region}</td>
                        <td className={`px-4 py-3 text-sm ${getAlarmTypeColor(outage.alarmType)}`}>
                          {outage.alarmType}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {formatDateTime(outage.occurrenceTime)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${daysOpen > 3 ? 'bg-red-900 text-red-200' : daysOpen > 1 ? 'bg-orange-900 text-orange-200' : 'bg-yellow-900 text-yellow-200'}`}>
                            {daysOpen} day{daysOpen !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          <span className="text-primary font-semibold">
                            {outage.expectedRestorationTime ? formatDateTime(outage.expectedRestorationTime) : 'Not set'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          <span className="italic text-yellow-300">{outage.rootCause || 'Under Investigation'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(outage.status)}`}>
                            {outage.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Ongoing Outages */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-destructive/10">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <h3 className="text-xl font-bold text-foreground">
                🔴 Today's Ongoing Outages ({ongoingOutages.length})
              </h3>
            </div>
          </div>

          {ongoingOutages.length > 0 ? (
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Root Cause</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ongoingOutages.map((outage) => (
                    <tr key={`ongoing-${outage.id}`} className="border-b border-border hover:bg-accent">
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
                        <span className="italic text-yellow-300">{outage.rootCause || 'Under Investigation'}</span>
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
              <p className="text-muted-foreground">✅ No ongoing outages</p>
            </div>
          )}
        </div>

        {/* Resolved Outages */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-success/10">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <h3 className="text-xl font-bold text-foreground">
                ✅ Resolved Outages ({resolvedOutages.length})
              </h3>
            </div>
          </div>

          {resolvedOutages.length > 0 ? (
            <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Site No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Site Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Region</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Alarm Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Occurrence Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Resolution Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">SLA Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Root Cause</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedOutages.map((outage) => {
                      const slaStatus = getSlaStatus(outage);
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
                            {outage.resolutionTime ? formatDateTime(outage.resolutionTime) : 'N/A'}
                          </td>
                          <td className={`px-4 py-3 text-sm ${slaStatus.color}`}>
                            {slaStatus.status}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">
                            <span className="italic text-yellow-300">{outage.rootCause || 'Not specified'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No resolved outages found</p>
              </div>
            )}
          </div>
        
      </div>

      {/* Detailed Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Root Cause Breakdown */}
        <div className="bg-card rounded-lg p-6 border border-border">
          <h3 className="text-foreground text-lg font-semibold mb-4">Detailed Root Cause Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground text-sm border-b border-border">
                  <th className="pb-3">Root Cause</th>
                  <th className="text-right pb-3">Count</th>
                  <th className="text-right pb-3">Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dailyReports.alarmsByRootCause
                  .sort((a, b) => b.count - a.count)
                  .map((item) => {
                    const percentage = dailyReports.summary.totalReports > 0
                      ? Math.round((item.count / dailyReports.summary.totalReports) * 100)
                      : 0;
                    
                    return (
                      <tr key={item.rootCause}>
                        <td className="py-3 text-foreground">{item.rootCause || 'Not specified'}</td>
                        <td className="text-right text-primary font-medium">{item.count}</td>
                        <td className="text-right text-muted-foreground">{percentage}%</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tickets Per Region */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-primary/10">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-primary" />
              <h3 className="text-xl font-bold text-foreground">
                📊 Tickets Per Region ({(dailyReports.ticketsPerRegion || []).length} regions)
              </h3>
            </div>
          </div>

          {(dailyReports.ticketsPerRegion || []).length > 0 ? (
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
                  {dailyReports.ticketsPerRegion.map((regionData, index) => {
                    // Handle both region and _id for backward compatibility
                    const region = regionData.region || regionData._id || 'Unknown';
                    // Handle both camelCase and snake_case property names for SLA counts
                    const withinSLA = Number(regionData.withinSLATickets ?? regionData.within_sla ?? 0);
                    const outOfSLA = Number(regionData.outOfSLATickets ?? regionData.out_of_sla ?? 0);
                    // Ensure we have valid numbers
                    const resolvedTickets = Number(regionData.resolvedTickets ?? 0);
                    
                    // Log for debugging
                    console.log(`Region: ${region}`, {
                      withinSLATickets: regionData.withinSLATickets,
                      within_sla: regionData.within_sla,
                      outOfSLATickets: regionData.outOfSLATickets,
                      out_of_sla: regionData.out_of_sla,
                      resolvedTickets: resolvedTickets,
                      calculatedWithinSLA: withinSLA,
                      calculatedOutOfSLA: outOfSLA
                    });
                    
                    return (
                      <tr key={`${region}-${index}`} className="border-b border-border hover:bg-accent">
                        <td className="px-4 py-3 text-sm font-semibold text-foreground">{region}</td>
                        <td className="px-4 py-3 text-sm text-primary font-bold">{regionData.totalTickets || 0}</td>
                        <td className="px-4 py-3 text-sm text-yellow-400">{regionData.inProgressTickets || 0}</td>
                        <td className="px-4 py-3 text-sm text-green-400">{resolvedTickets}</td>
                        <td className="px-4 py-3 text-sm text-green-500 font-semibold">
                          {withinSLA > 0 ? withinSLA : 0}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-500 font-semibold">
                          {outOfSLA > 0 ? outOfSLA : 0}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-500 font-semibold">{regionData.criticalAlarms || 0}</td>
                        <td className="px-4 py-3 text-sm text-orange-500 font-semibold">{regionData.majorAlarms || 0}</td>
                        <td className="px-4 py-3 text-sm text-yellow-500">{regionData.minorAlarms || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No regional ticket data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Region-wise Analysis - Count-based */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold text-foreground mb-4">Region-wise Analysis</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dailyReports.ticketsPerRegion.map((regionData) => {
            const region = regionData.region || regionData._id || 'Unknown';
            const regionReports = dailyReports.allReports.filter(
              report => (report.region || 'Unknown') === region
            );
            
            // Count root causes for this region
            const rootCauseCounts = regionReports.reduce((acc, report) => {
              const cause = report.rootCause || 'Not specified';
              acc[cause] = (acc[cause] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            // SLA Data
            const withinSLA = Number(regionData.withinSLATickets ?? regionData.within_sla ?? 0);
            const outOfSLA = Number(regionData.outOfSLATickets ?? regionData.out_of_sla ?? 0);
            const totalSLA = withinSLA + outOfSLA;
            const slaPercentage = totalSLA > 0 ? Math.round((withinSLA / totalSLA) * 100) : 0;

            // Sort root causes by count (descending)
            const sortedCauses = Object.entries(rootCauseCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3); // Show top 3 causes

            return (
              <div key={region} className="bg-card rounded-lg p-4 border border-border hover:border-primary transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-semibold text-foreground">{region}</h3>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    slaPercentage >= 90 ? 'bg-green-900/30 text-green-400' : 
                    slaPercentage >= 70 ? 'bg-yellow-900/30 text-yellow-400' : 
                    'bg-red-900/30 text-red-400'
                  }`}>
                    {slaPercentage}% SLA
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">SLA Compliance</h4>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-green-500 to-red-500 h-2 rounded-full" 
                          style={{ width: `${slaPercentage}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">
                        {withinSLA}/{totalSLA || '0'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Top Causes</h4>
                    <div className="space-y-1">
                      {sortedCauses.length > 0 ? (
                        sortedCauses.map(([cause, count]) => (
                          <div key={cause} className="flex justify-between text-sm">
                            <span className="text-foreground truncate pr-2">{cause}</span>
                            <span className="text-muted-foreground font-medium">{count}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">No data available</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-400">{withinSLA}</div>
                      <div className="text-xs text-muted-foreground">Within SLA</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-400">{outOfSLA}</div>
                      <div className="text-xs text-muted-foreground">Out of SLA</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </div>
  );
};

export { DailyReports };