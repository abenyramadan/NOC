import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { outageReportService, DailyReportsResponse, OutageReport } from '../services/outageReportService';
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
  
  // Filter reports based on status with proper type assertion
  const { ongoingOutages, resolvedOutages } = useMemo(() => {
    const reports = dailyReports?.allReports || [];
    return {
      ongoingOutages: reports.filter((report: OutageReport) => 
        (report.status as string) === 'In Progress' || (report.status as string) === 'Open'
      ),
      resolvedOutages: reports.filter((report: OutageReport) => 
        (report.status as string) === 'Resolved' || (report.status as string) === 'Closed'
      )
    };
  }, [dailyReports]);
  
  // Helper functions for formatting and styling
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
        console.log('Daily reports data:', data);
        console.log('Tickets per region (raw):', JSON.stringify(data.ticketsPerRegion, null, 2));
        console.log('All reports regions:', [...new Set(data.allReports.map(r => r.region))]);
        setDailyReports(data);
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

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (!dailyReports) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">No data available for the selected date</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Daily Reports</h1>
        <div className="flex items-center space-x-4">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={exportToPDF}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center space-x-2"
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
        <div className="bg-[#1e2230] rounded-lg border border-gray-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Total Tickets</p>
              <p className="text-2xl font-bold text-white">{dailyReports?.summary.totalReports || 0}</p>
            </div>
            <div className="p-3 rounded-full bg-blue-900/30">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </div>

        {/* Resolved Card */}
        <div className="bg-[#1e2230] rounded-lg border border-gray-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">Resolved</p>
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
        <div className="bg-[#1e2230] rounded-lg border border-gray-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">In Progress</p>
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
        <div className="bg-[#1e2230] rounded-lg border border-gray-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">MTTR (minutes)</p>
              <p className="text-2xl font-bold text-purple-400">{dailyReports?.summary.mttr ? Math.round(dailyReports.summary.mttr) : 'N/A'}</p>
              <p className="text-xs text-gray-400">Mean Time To Resolve</p>
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

      {/* Outages Section */}
      <div className="space-y-6">
        {/* Ongoing Outages */}
        <div className="bg-[#1e2230] rounded-lg border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 bg-red-900/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <h3 className="text-xl font-bold text-white">
                🔴 Ongoing Outages ({ongoingOutages.length})
              </h3>
            </div>
          </div>

          {ongoingOutages.length > 0 ? (
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Root Cause</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ongoingOutages.map((outage) => (
                    <tr key={`ongoing-${outage.id}`} className="border-b border-gray-800 hover:bg-gray-800/50">
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
              <p className="text-gray-400">✅ No ongoing outages</p>
            </div>
          )}
        </div>

        {/* Resolved Outages */}
        <div className="bg-[#1e2230] rounded-lg border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 bg-green-900/20">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <h3 className="text-xl font-bold text-white">
                ✅ Resolved Outages ({resolvedOutages.length})
              </h3>
            </div>
          </div>

          {resolvedOutages.length > 0 ? (
            <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#151820] border-b border-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Site No</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Site Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Region</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Alarm Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Occurrence Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Resolution Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">SLA Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Root Cause</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedOutages.map((outage) => {
                      const slaStatus = getSlaStatus(outage);
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
                            {outage.resolutionTime ? formatDateTime(outage.resolutionTime) : 'N/A'}
                          </td>
                          <td className={`px-4 py-3 text-sm ${slaStatus.color}`}>
                            {slaStatus.status}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300">
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
                <p className="text-gray-400">No resolved outages found</p>
              </div>
            )}
          </div>
        
      </div>

      {/* Detailed Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Root Cause Breakdown */}
        <div className="bg-[#1e2230] rounded-lg p-6 border border-gray-800">
          <h3 className="text-white text-lg font-semibold mb-4">Detailed Root Cause Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-3">Root Cause</th>
                  <th className="text-right pb-3">Count</th>
                  <th className="text-right pb-3">Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {dailyReports.alarmsByRootCause
                  .sort((a, b) => b.count - a.count)
                  .map((item) => {
                    const percentage = dailyReports.summary.totalReports > 0
                      ? Math.round((item.count / dailyReports.summary.totalReports) * 100)
                      : 0;
                    
                    return (
                      <tr key={item.rootCause}>
                        <td className="py-3 text-gray-300">{item.rootCause || 'Not specified'}</td>
                        <td className="text-right text-blue-400 font-medium">{item.count}</td>
                        <td className="text-right text-gray-400">{percentage}%</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Region Details */}
        <div className="bg-[#1e2230] rounded-lg p-6 border border-gray-800">
          <h3 className="text-white text-lg font-semibold mb-4">Region Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full rounded-lg overflow-hidden">
              <thead>
                <tr className="text-left text-white text-sm">
                  <th className="py-3 px-4 bg-[#0066ff]">Region</th>
                  <th className="py-3 px-4 bg-[#0066ff] text-right">Total</th>
                  <th className="py-3 px-4 bg-[#0066ff] text-right">In Progress</th>
                  <th className="py-3 px-4 bg-[#0066ff] text-right">Resolved</th>
                  <th className="py-3 px-4 bg-[#0066ff] text-right">Within SLA</th>
                  <th className="py-3 px-4 bg-[#0066ff] text-right">Out of SLA</th>
                  <th className="py-3 px-4 bg-[#0066ff] text-right">SLA %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {dailyReports.ticketsPerRegion.map((item, index) => {
                  // Handle both region and _id for backward compatibility
                  const region = item.region || item._id || 'Unknown';
                  const withinSLA = item.withinSLATickets || item.within_sla || 0;
                  const outOfSLA = item.outOfSLATickets || item.out_of_sla || 0;
                  const slaPercentage = item.resolvedTickets > 0 
                    ? Math.round((withinSLA / item.resolvedTickets) * 100) 
                    : 0;
                  
                  return (
                    <tr key={`region-${index}`} className="hover:bg-gray-800/50">
                      <td className="py-3 text-white font-medium">{region}</td>
                      <td className="text-center text-blue-400 font-medium">{item.totalTickets}</td>
                      <td className="text-center text-yellow-400">{item.inProgressTickets}</td>
                      <td className="text-center text-green-400">{item.resolvedTickets}</td>
                      <td className="text-center text-green-500">{withinSLA}</td>
                      <td className="text-center text-red-400">{outOfSLA}</td>
                      <td className={`text-center font-medium ${
                        slaPercentage >= 90 ? 'text-green-400' : 
                        slaPercentage >= 80 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {slaPercentage}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Root Cause Analysis by Region */}
          <div className="mt-6">
            <h4 className="text-white text-md font-semibold mb-3">Root Cause Analysis by Region</h4>
            <div className="space-y-4">
              {dailyReports.ticketsPerRegion.map((item, index) => {
                // Handle both region and _id for backward compatibility
                const region = item.region || item._id || 'Unknown';
                const regionReports = dailyReports.allReports.filter(r => {
                  const reportRegion = r.region || 'Unknown';
                  return reportRegion === region;
                });
                const rootCauses: { [key: string]: number } = {};
                
                regionReports.forEach(report => {
                  if (['Resolved', 'Closed'].includes(report.status)) {
                    const rootCause = report.rootCause || 'Not specified';
                    rootCauses[rootCause] = (rootCauses[rootCause] || 0) + 1;
                  }
                });
                
                // Skip regions with no root causes
                if (Object.keys(rootCauses).length === 0) {
                  return null;
                }
                
                return (
                  <div key={`region-root-cause-${index}`} className="bg-gray-800/50 p-4 rounded-lg">
                    <h5 className="text-white font-medium mb-2">{region}</h5>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {Object.entries(rootCauses)
                        .sort(([,a], [,b]) => b - a)
                        .map(([cause, count]) => (
                          <div key={cause} className="flex items-center text-sm">
                            <span className="text-purple-300">{cause}:</span>
                            <span className="ml-1 font-medium">{count}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
</div>
</div>

);
}

export { DailyReports };