import React, { useState, useEffect } from 'react';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { reportsService } from '../services/reportsService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface HistoricalReportFilters {
  regions: string[];
  rootCauses: string[];
  alarmTypes: string[];
  statuses: string[];
}

interface HistoricalReport {
  id: string;
  siteNo: string;
  siteCode: string;
  region: string;
  alarmType: string;
  occurrenceTime: Date;
  resolutionTime?: Date;
  expectedResolutionHours?: number;
  status: string;
  rootCause?: string;
  supervisor?: string;
  createdBy?: { name: string; username: string };
  updatedBy?: { name: string; username: string };
}

interface HistoricalStats {
  totalReports: number;
  resolvedCount: number;
  openCount: number;
  inProgressCount: number;
  mttr: number;
  slaCompliance: number;
  withinSLA: number;
  totalResolved: number;
}

export const HistoricalReports: React.FC = () => {
  const [dateRange, setDateRange] = useState({
    start: startOfWeek(new Date()),
    end: endOfWeek(new Date())
  });
  const [filters, setFilters] = useState<HistoricalReportFilters>({
    regions: [],
    rootCauses: [],
    alarmTypes: [],
    statuses: []
  });
  const [reports, setReports] = useState<HistoricalReport[]>([]);
  const [carryOver, setCarryOver] = useState<HistoricalReport[]>([]);
  const [stats, setStats] = useState<HistoricalStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    current: 1,
    total: 1,
    count: 0,
    totalReports: 0
  });

  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Available filter options
  const regions = [
    'C.E.S', 'E.E.S', 'W.E.S', 'WARRAP', 'JONGLEI', 'UNITY', 'LAKES', 'N.B.G.S', 'W.B.G.S', 'UPPERNILE'
  ];

  const rootCauses = ['Generator', 'Transmission', 'Radio', 'Environment', 'Others'];
  const alarmTypes = ['CRITICAL', 'MAJOR', 'MINOR', 'WARNING', 'INFO'];
  const statuses = ['Open', 'In Progress', 'Resolved', 'Closed'];

  useEffect(() => {
    fetchHistoricalReports();
  }, [dateRange, filters, pagination.current]);

  const fetchHistoricalReports = async () => {
    try {
      setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams({
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString(),
        page: pagination.current.toString(),
        limit: '50'
      });

      // Add filter parameters
      if (filters.regions.length > 0) queryParams.append('regions', filters.regions.join(','));
      if (filters.rootCauses.length > 0) queryParams.append('rootCauses', filters.rootCauses.join(','));
      if (filters.alarmTypes.length > 0) queryParams.append('alarmTypes', filters.alarmTypes.join(','));
      if (filters.statuses.length > 0) queryParams.append('statuses', filters.statuses.join(','));

      const response = await reportsService.getHistoricalReports(queryParams.toString());

      setReports(response.reports.map(report => ({
        ...report,
        occurrenceTime: new Date(report.occurrenceTime),
        resolutionTime: report.resolutionTime ? new Date(report.resolutionTime) : undefined
      })));
      setCarryOver(response.carryOver.map(report => ({
        ...report,
        occurrenceTime: new Date(report.occurrenceTime),
        resolutionTime: report.resolutionTime ? new Date(report.resolutionTime) : undefined
      })));
      setStats(response.stats);
      setPagination(response.pagination);
    } catch (err) {
      console.error('Failed to fetch historical reports:', err);
      setError(err instanceof Error ? err.message : 'Failed to load historical reports');
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    setDateRange(prev => ({
      ...prev,
      [field]: new Date(value)
    }));
  };

  const handleFilterChange = (filterType: keyof HistoricalReportFilters, value: string, checked: boolean) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: checked
        ? [...prev[filterType], value]
        : prev[filterType].filter(item => item !== value)
    }));
  };

  const clearFilters = () => {
    setFilters({
      regions: [],
      rootCauses: [],
      alarmTypes: [],
      statuses: []
    });
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    try {
      setExporting(true);
      if (format === 'pdf') {
        await exportToPDF();
      } else {
        await exportToExcel();
      }
    } catch (err) {
      console.error('Export failed:', err);
      setError('Failed to export reports');
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();

    // Title
    doc.setFontSize(20);
    doc.text('Historical Outage Reports', 14, 22);

    // Date range
    doc.setFontSize(12);
    doc.text(`Report Period: ${format(dateRange.start, 'MMM dd, yyyy')} - ${format(dateRange.end, 'MMM dd, yyyy')}`, 14, 35);

    // Summary stats
    if (stats) {
      doc.text(`Total Reports: ${stats.totalReports} | MTTR: ${stats.mttr}min | SLA Compliance: ${stats.slaCompliance}% | Carry-over: ${carryOver.length}`, 14, 45);
    }

    // Table data
    const tableColumns = ['Site', 'Region', 'Type', 'Occurrence', 'Expected (hrs)', 'Root Cause', 'Resolution', 'Status', 'Updated By'];
    const tableRows = reports.map(report => [
      `${report.siteNo} - ${report.siteCode}`,
      report.region,
      report.alarmType,
      formatDateTime(report.occurrenceTime),
      report.expectedResolutionHours ? `${report.expectedResolutionHours} hours` : 'Not set',
      report.rootCause || 'Not specified',
      report.resolutionTime ? formatDateTime(report.resolutionTime) : 'Not resolved',
      report.status,
      report.updatedBy?.name || report.createdBy?.name || 'System'
    ]);

    // Add carry-over section if exists
    if (carryOver.length > 0) {
      doc.addPage();
      doc.setFontSize(16);
      doc.text('Carry-over Incidents', 14, 22);
      doc.setFontSize(10);
      doc.text('These incidents were ongoing before the selected date range:', 14, 32);

      const carryOverRows = carryOver.map(report => [
        `${report.siteNo} - ${report.siteCode}`,
        report.alarmType,
        formatDateTime(report.occurrenceTime),
        getDaysDuration(report.occurrenceTime),
        report.status
      ]);

      autoTable(doc, {
        head: [['Site', 'Type', 'Started', 'Duration (days)', 'Status']],
        body: carryOverRows,
        startY: 40,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 185] }
      });
    }

    // Main reports table
    autoTable(doc, {
      head: [tableColumns],
      body: tableRows,
      startY: stats ? 55 : 50,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Generated on ${new Date().toLocaleDateString()} - Page ${i} of ${pageCount}`, 14, doc.internal.pageSize.height - 10);
    }

    doc.save(`historical-reports-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['Historical Outage Reports Summary'],
      ['Report Period', `${format(dateRange.start, 'MMM dd, yyyy')} - ${format(dateRange.end, 'MMM dd, yyyy')}`],
      ['Generated On', new Date().toLocaleString()],
      [''],
      ['Summary Statistics'],
      ['Total Reports', stats?.totalReports.toString() || '0'],
      ['MTTR (minutes)', stats?.mttr.toString() || '0'],
      ['SLA Compliance (%)', stats?.slaCompliance.toString() || '0'],
      ['Carry-over Incidents', carryOver.length.toString()],
      ['']
    ];

    if (stats) {
      summaryData.push(
        ['Resolved', stats.resolvedCount.toString()],
        ['Open', stats.openCount.toString()],
        ['In Progress', stats.inProgressCount.toString()],
        ['Within SLA', stats.withinSLA.toString()],
        ['Total Resolved', stats.totalResolved.toString()]
      );
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Reports sheet
    const reportsData = [
      ['Site', 'Region', 'Type', 'Occurrence', 'Expected Hours', 'Root Cause', 'Resolution', 'Status', 'Updated By']
    ];

    reports.forEach(report => {
      reportsData.push([
        `${report.siteNo} - ${report.siteCode}`,
        report.region,
        report.alarmType,
        formatDateTime(report.occurrenceTime),
        report.expectedResolutionHours ? report.expectedResolutionHours.toString() : 'Not set',
        report.rootCause || 'Not specified',
        report.resolutionTime ? formatDateTime(report.resolutionTime) : 'Not resolved',
        report.status,
        report.updatedBy?.name || report.createdBy?.name || 'System'
      ]);
    });

    const reportsSheet = XLSX.utils.aoa_to_sheet(reportsData);
    XLSX.utils.book_append_sheet(workbook, reportsSheet, 'Reports');

    // Carry-over sheet (if exists)
    if (carryOver.length > 0) {
      const carryOverData = [
        ['Carry-over Incidents'],
        ['These incidents were ongoing before the selected date range'],
        [''],
        ['Site', 'Type', 'Started', 'Duration (days)', 'Status']
      ];

      carryOver.forEach(report => {
        carryOverData.push([
          `${report.siteNo} - ${report.siteCode}`,
          report.alarmType,
          formatDateTime(report.occurrenceTime),
          `${getDaysDuration(report.occurrenceTime)} days`,
          report.status
        ]);
      });

      const carryOverSheet = XLSX.utils.aoa_to_sheet(carryOverData);
      XLSX.utils.book_append_sheet(workbook, carryOverSheet, 'Carry-over');
    }

    // Auto-size columns
    const reportsCols = [
      { wch: 15 }, // Site
      { wch: 12 }, // Region
      { wch: 10 }, // Type
      { wch: 18 }, // Occurrence
      { wch: 15 }, // Expected Hours
      { wch: 15 }, // Root Cause
      { wch: 18 }, // Resolution
      { wch: 10 }, // Status
      { wch: 15 }  // Updated By
    ];
    reportsSheet['!cols'] = reportsCols;

    XLSX.writeFile(workbook, `historical-reports-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const formatDateTime = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Open': return 'bg-red-500';
      case 'In Progress': return 'bg-yellow-500';
      case 'Resolved': return 'bg-green-500';
      case 'Closed': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getAlarmTypeColor = (alarmType: string) => {
    switch (alarmType) {
      case 'CRITICAL': return 'text-red-600 font-bold';
      case 'MAJOR': return 'text-orange-600 font-bold';
      case 'MINOR': return 'text-yellow-600 font-bold';
      default: return 'text-gray-600';
    }
  };

  const getDaysDuration = (startTime: Date, endTime?: Date) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">📊 Historical Report Viewer</h2>
        <p className="text-gray-400">View and analyze past outage reports with advanced filtering and export capabilities</p>
      </div>

      {/* Date Range Picker */}
      <div className="bg-[#1e2230] rounded-lg p-4 border border-gray-800 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-gray-400 mb-2">📅 Start Date</label>
            <input
              type="date"
              value={format(dateRange.start, 'yyyy-MM-dd')}
              onChange={(e) => handleDateChange('start', e.target.value)}
              className="bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">📅 End Date</label>
            <input
              type="date"
              value={format(dateRange.end, 'yyyy-MM-dd')}
              onChange={(e) => handleDateChange('end', e.target.value)}
              className="bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div className="flex-1 flex items-end">
            <div className="text-sm text-cyan-400 font-medium">
              📊 Viewing reports from {format(dateRange.start, 'MMM dd, yyyy')} to {format(dateRange.end, 'MMM dd, yyyy')}
            </div>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
          >
            🔍 Filters {Object.values(filters).some(arr => arr.length > 0) && '●'}
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-[#1e2230] rounded-lg p-4 border border-gray-800 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Regions Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Regions</label>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {regions.map((region, index) => (
                  <label key={region || index} className="flex items-center text-sm">
                    <input
                      type="checkbox"
                      checked={filters.regions.includes(region)}
                      onChange={(e) => handleFilterChange('regions', region, e.target.checked)}
                      className="mr-2"
                    />
                    {region}
                  </label>
                ))}
              </div>
            </div>

            {/* Root Causes Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Root Causes</label>
              <div className="space-y-2">
                {rootCauses.map((cause, index) => (
                  <label key={cause || index} className="flex items-center text-sm">
                    <input
                      type="checkbox"
                      checked={filters.rootCauses.includes(cause)}
                      onChange={(e) => handleFilterChange('rootCauses', cause, e.target.checked)}
                      className="mr-2"
                    />
                    {cause}
                  </label>
                ))}
              </div>
            </div>

            {/* Alarm Types Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Alarm Types</label>
              <div className="space-y-2">
                {alarmTypes.map((type, index) => (
                  <label key={type || index} className="flex items-center text-sm">
                    <input
                      type="checkbox"
                      checked={filters.alarmTypes.includes(type)}
                      onChange={(e) => handleFilterChange('alarmTypes', type, e.target.checked)}
                      className="mr-2"
                    />
                    {type}
                  </label>
                ))}
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Status</label>
              <div className="space-y-2">
                {statuses.map((status, index) => (
                  <label key={status || index} className="flex items-center text-sm">
                    <input
                      type="checkbox"
                      checked={filters.statuses.includes(status)}
                      onChange={(e) => handleFilterChange('statuses', status, e.target.checked)}
                      className="mr-2"
                    />
                    {status}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-between mt-4">
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
            >
              Clear All
            </button>
            <button
              onClick={() => setShowFilters(false)}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#1e2230] rounded-lg p-4 border border-gray-800">
            <div className="text-2xl font-bold text-cyan-400">{stats.totalReports}</div>
            <div className="text-sm text-gray-400">Total Reports</div>
          </div>
          <div className="bg-[#1e2230] rounded-lg p-4 border border-gray-800">
            <div className="text-2xl font-bold text-green-400">{stats.mttr}min</div>
            <div className="text-sm text-gray-400">Average MTTR</div>
          </div>
          <div className="bg-[#1e2230] rounded-lg p-4 border border-gray-800">
            <div className="text-2xl font-bold text-blue-400">{stats.slaCompliance}%</div>
            <div className="text-sm text-gray-400">SLA Compliance</div>
          </div>
          <div className="bg-[#1e2230] rounded-lg p-4 border border-gray-800">
            <div className="text-2xl font-bold text-yellow-400">{carryOver.length}</div>
            <div className="text-sm text-gray-400">Carry-over Incidents</div>
          </div>
        </div>
      )}

      {/* Export Controls */}
      <div className="flex justify-end gap-2 mb-4">
        <button
          onClick={() => handleExport('excel')}
          disabled={exporting}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded transition-colors"
        >
          📊 Export Excel
        </button>
        <button
          onClick={() => handleExport('pdf')}
          disabled={exporting}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded transition-colors"
        >
          📄 Export PDF
        </button>
      </div>

      {/* Carry-over Section */}
      {carryOver.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-yellow-400 mb-2">🔁 Carry-over Incidents ({carryOver.length})</h3>
          <p className="text-sm text-gray-300 mb-4">
            These incidents were ongoing before the selected date range and may span multiple days.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="px-4 py-2 text-left text-gray-400">Site</th>
                  <th className="px-4 py-2 text-left text-gray-400">Type</th>
                  <th className="px-4 py-2 text-left text-gray-400">Started</th>
                  <th className="px-4 py-2 text-left text-gray-400">Duration</th>
                  <th className="px-4 py-2 text-left text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {carryOver.slice(0, 5).map((report, index) => (
                  <tr key={report.id || `carry-over-${index}`} className="border-b border-gray-700">
                    <td className="px-4 py-2 text-gray-300">{report.siteNo} - {report.siteCode}</td>
                    <td className="px-4 py-2 text-gray-300">{report.alarmType}</td>
                    <td className="px-4 py-2 text-gray-300">{formatDateTime(report.occurrenceTime)}</td>
                    <td className="px-4 py-2 text-gray-300">{getDaysDuration(report.occurrenceTime)} days</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusBadgeColor(report.status)}`}>
                        {report.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reports Table */}
      <div className="bg-[#1e2230] rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center">
          <h3 className="text-xl font-bold text-white">Historical Reports</h3>
          <div className="text-sm text-gray-400">
            Page {pagination.current} of {pagination.total} ({pagination.totalReports} total reports)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#151820] border-b border-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Site</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Region</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Occurrence</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Expected (hrs)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Root Cause</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Resolution</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Updated By</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report, index) => (
                <tr key={report.id || `report-${index}`} className="border-b border-gray-800 hover:bg-gray-800">
                  <td className="px-4 py-3 text-sm text-gray-300">
                    <div>{report.siteNo}</div>
                    <div className="text-xs text-gray-500">{report.siteCode}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">{report.region}</td>
                  <td className={`px-4 py-3 text-sm ${getAlarmTypeColor(report.alarmType)}`}>
                    {report.alarmType}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {formatDateTime(report.occurrenceTime)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {report.expectedResolutionHours ? `${report.expectedResolutionHours} hours` : 'Not set'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {report.rootCause || 'Not specified'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {report.resolutionTime ? formatDateTime(report.resolutionTime) : 'Not resolved'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(report.status)}`}>
                      {report.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {report.updatedBy?.name || report.createdBy?.name || 'System'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-800 flex justify-between items-center">
          <button
            onClick={() => setPagination(prev => ({ ...prev, current: prev.current - 1 }))}
            disabled={pagination.current === 1}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            Previous
          </button>
          <div className="text-sm text-gray-400">
            Page {pagination.current} of {pagination.total}
          </div>
          <button
            onClick={() => setPagination(prev => ({ ...prev, current: prev.current + 1 }))}
            disabled={pagination.current === pagination.total}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading historical reports...</div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {reports.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-gray-400">No reports found for the selected date range and filters.</p>
        </div>
      )}
    </div>
  );
};
