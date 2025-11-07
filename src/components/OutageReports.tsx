import React, { useState, useEffect } from 'react';
import { Calendar } from './ui/calendar';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { outageReportService, OutageReport, OutageReportFilters } from '../services/outageReportService';

export const OutageReports: React.FC = () => {
  const [reports, setReports] = useState<OutageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<OutageReport | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedHour, setSelectedHour] = useState<string>(new Date().getHours().toString()); // Default to current hour
  const [filters, setFilters] = useState<OutageReportFilters>({
    page: 1,
    limit: 50,
    status: 'all',
    region: 'all',
    alarmType: 'all',
    sortBy: 'occurrenceTime',
    sortOrder: 'desc'
  });

  useEffect(() => {
    fetchReports();
  }, [filters, selectedDate, selectedHour]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Build filters with hour if selected
      const queryFilters = { ...filters };
      if (selectedHour !== 'all') {
        // Construct reportHour timestamp for the selected date and hour
        const hourDate = new Date(selectedDate);
        hourDate.setHours(parseInt(selectedHour), 0, 0, 0);
        (queryFilters as any).reportHour = hourDate.toISOString();
      } else {
        // Filter by date range (whole day)
        const startDate = new Date(selectedDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);
        (queryFilters as any).startDate = startDate.toISOString();
        (queryFilters as any).endDate = endDate.toISOString();
      }
      
      const response = await outageReportService.getOutageReports(queryFilters);
      
      // Ensure all date fields are proper Date objects
      const processedReports = response.reports.map(report => ({
        ...report,
        occurrenceTime: new Date(report.occurrenceTime),
        expectedRestorationTime: report.expectedRestorationTime ? new Date(report.expectedRestorationTime) : undefined,
        mandatoryRestorationTime: report.mandatoryRestorationTime ? new Date(report.mandatoryRestorationTime) : undefined,
        resolutionTime: report.resolutionTime ? new Date(report.resolutionTime) : undefined,
        createdAt: new Date(report.createdAt),
        updatedAt: new Date(report.updatedAt),
        reportHour: new Date(report.reportHour),
        emailSentAt: report.emailSentAt ? new Date(report.emailSentAt) : undefined
      }));
      
      setReports(processedReports);
    } catch (err) {
      console.error('Failed to fetch outage reports:', err);
      setError(err instanceof Error ? err.message : 'Failed to load outage reports');
      setReports([]); // Clear reports on error
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (report: OutageReport) => {
    // Create a copy of the report with all existing values
    setEditingReport({
      ...report,
      // Ensure date fields are proper Date objects
      expectedRestorationTime: report.expectedRestorationTime ? 
        (report.expectedRestorationTime instanceof Date ? report.expectedRestorationTime : new Date(report.expectedRestorationTime)) : 
        undefined,
      mandatoryRestorationTime: report.mandatoryRestorationTime ? 
        (report.mandatoryRestorationTime instanceof Date ? report.mandatoryRestorationTime : new Date(report.mandatoryRestorationTime)) : 
        undefined,
      resolutionTime: report.resolutionTime ? 
        (report.resolutionTime instanceof Date ? report.resolutionTime : new Date(report.resolutionTime)) : 
        undefined,
      subrootCause: report.subrootCause || '',
      username: report.username || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingReport) return;

    // Clear previous errors
    setError(null);

    // Only require fields if they're being changed or if they're required for the status
    const errors: string[] = [];
    const originalReport = reports.find(r => r.id === editingReport.id);
    
    // Only validate expectedRestorationTime if it's being changed
    if (editingReport.expectedRestorationTime === undefined && 
        (!originalReport || !originalReport.expectedRestorationTime)) {
      errors.push('Expected Restoration Time is required');
    }
    
    // Only validate mandatoryRestorationTime if it's being changed
    if (editingReport.mandatoryRestorationTime === undefined && 
        (!originalReport || !originalReport.mandatoryRestorationTime)) {
      errors.push('Mandatory Restoration Time is required');
    }
    
    if (errors.length > 0) {
      setError(errors.join('. ') + '.');
      return;
    }

    try {
      // Only include fields that have changed
      const updateData: any = {};
      if (editingReport.status !== originalReport?.status) updateData.status = editingReport.status;
      if (editingReport.rootCause !== originalReport?.rootCause) updateData.rootCause = editingReport.rootCause;
      if (editingReport.subrootCause !== originalReport?.subrootCause) updateData.subrootCause = editingReport.subrootCause;
      if (editingReport.username !== originalReport?.username) updateData.username = editingReport.username;
      if (editingReport.supervisor !== originalReport?.supervisor) updateData.supervisor = editingReport.supervisor;
      
      // Only update resolution time if it's being set (not unset)
      if (editingReport.resolutionTime && editingReport.status === 'Resolved' && !originalReport?.resolutionTime) {
        updateData.resolutionTime = editingReport.resolutionTime;
      }
      
      // Only update restoration times if they're being changed
      if (editingReport.expectedRestorationTime !== undefined && 
          (!originalReport || 
           editingReport.expectedRestorationTime?.getTime() !== originalReport.expectedRestorationTime?.getTime())) {
        updateData.expectedRestorationTime = editingReport.expectedRestorationTime;
      }
      
      if (editingReport.mandatoryRestorationTime !== undefined && 
          (!originalReport || 
           editingReport.mandatoryRestorationTime?.getTime() !== originalReport.mandatoryRestorationTime?.getTime())) {
        updateData.mandatoryRestorationTime = editingReport.mandatoryRestorationTime;
      }
      
      // If no changes were made, just close the editor
      if (Object.keys(updateData).length === 0) {
        setEditingReport(null);
        return;
      }
      
      await outageReportService.updateOutageReport(editingReport.id, updateData);

      // Update local state
      setReports(prev => prev.map(r =>
        r.id === editingReport.id ? editingReport : r
      ));

      setEditingReport(null);

      // Notify other components that outage reports have been updated
      window.dispatchEvent(new CustomEvent('outageReportsUpdated'));
    } catch (err) {
      console.error('Failed to update outage report:', err);
      setError(err instanceof Error ? err.message : 'Failed to update outage report');
    }
  };

  const handleCancelEdit = () => {
    setEditingReport(null);
  };

  const handleFilterChange = (key: keyof OutageReportFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
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

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'In Progress': return 'bg-yellow-100 text-yellow-800';
      case 'Resolved': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading outage reports...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">NOCALERT Hourly Outage Report</h2>
        <p className="text-gray-400">Manage and track network outages with editable fields</p>
      </div>

      {/* Date and Hour Filters */}
      <div className="bg-[#1e2230] rounded-lg p-4 border border-gray-800 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-gray-400 mb-2">📅 Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal bg-[#151820] border-gray-700 text-gray-300 hover:bg-[#1e2230]',
                    !selectedDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(new Date(selectedDate), 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-[#1e2230] border-gray-700">
                <Calendar
                  mode="single"
                  selected={new Date(selectedDate)}
                  onSelect={(date) => date && setSelectedDate(date.toISOString().split('T')[0])}
                  className="bg-[#1e2230] text-white"
                  classNames={{
                    day_selected: 'bg-cyan-600 hover:bg-cyan-700',
                    day_today: 'bg-gray-700 text-white',
                    day_disabled: 'text-gray-500',
                    day_outside: 'text-gray-500',
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">🕐 Hour</label>
            <select
              value={selectedHour}
              onChange={(e) => setSelectedHour(e.target.value)}
              className="bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
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
          <div className="flex-1 flex items-end">
            <div className="text-sm text-cyan-400 font-medium">
              {selectedHour === 'all' 
                ? `📊 Viewing all reports for ${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
                : `📊 Viewing reports for ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} from ${selectedHour.padStart(2, '0')} to ${((parseInt(selectedHour) + 1) % 24).toString().padStart(2, '0')}`
              }
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#1e2230] rounded-lg p-4 border border-gray-800 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-2">Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Region</label>
            <select
              value={filters.region}
              onChange={(e) => handleFilterChange('region', e.target.value)}
              className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">All Regions</option>
              <option value="Bahr gha zal">Bahr gha zal</option>
              <option value="Equatoria">Equatoria</option>
              <option value="Upper Nile">Upper Nile</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Alarm Type</label>
            <select
              value={filters.alarmType}
              onChange={(e) => handleFilterChange('alarmType', e.target.value)}
              className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="CRITICAL">Critical</option>
              <option value="MAJOR">Major</option>
              <option value="MINOR">Minor</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Info</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-2">Sort By</label>
            <select
              value={`${filters.sortBy}-${filters.sortOrder}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split('-');
                handleFilterChange('sortBy', sortBy);
                handleFilterChange('sortOrder', sortOrder);
              }}
              className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="occurrenceTime-desc">Latest First</option>
              <option value="occurrenceTime-asc">Oldest First</option>
              <option value="siteNo-asc">Site No A-Z</option>
              <option value="siteNo-desc">Site No Z-A</option>
              <option value="alarmType-asc">Alarm Type A-Z</option>
              <option value="alarmType-desc">Alarm Type Z-A</option>
            </select>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-[#1e2230] rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="text-xl font-bold text-white">Outage Reports</h3>
          <p className="text-sm text-gray-400 mt-1">Showing {reports.length} reports</p>
        </div>

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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Edit</th>
              </tr>
            </thead>
            <tbody>
              {reports
                .filter(report => report && report.id && typeof report === 'object')
                .map((report) => (
                <tr key={report.id} className="border-b border-gray-800 hover:bg-gray-800">
                  <td className="px-4 py-3 text-sm text-gray-300">{report.siteNo || 'N/A'}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{report.siteCode || 'Unknown'}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{report.region || 'Unknown'}</td>
                  <td className={`px-4 py-3 text-sm ${getAlarmTypeColor(report.alarmType)}`}>
                    {report.alarmType || 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {report.occurrenceTime ? formatDateTime(report.occurrenceTime) : 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {editingReport?.id === report.id ? (
                      <div className="space-y-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full justify-start text-left font-normal bg-[#151820] border-gray-700 text-gray-300 hover:bg-[#1e2230]',
                                !editingReport.expectedRestorationTime && 'text-muted-foreground'
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {editingReport.expectedRestorationTime ? 
                                format(editingReport.expectedRestorationTime, 'PPPp') : 
                                <span>Pick a date and time</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-[#1e2230] border-gray-700">
                            <Calendar
                              mode="single"
                              selected={editingReport.expectedRestorationTime || undefined}
                              onSelect={(date) => {
                                if (date) {
                                  const current = editingReport.expectedRestorationTime || new Date();
                                  date.setHours(current.getHours(), current.getMinutes(), 0, 0);
                                  setEditingReport(prev => prev ? {
                                    ...prev,
                                    expectedRestorationTime: date
                                  } : null);
                                }
                              }}
                              className="bg-[#1e2230] text-white"
                              classNames={{
                                day_selected: 'bg-cyan-600 hover:bg-cyan-700',
                                day_today: 'bg-gray-700 text-white',
                                day_disabled: 'text-gray-500',
                                day_outside: 'text-gray-500',
                              }}
                              initialFocus
                            />
                            <div className="p-3 border-t border-gray-700">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-300">Time:</span>
                                <input
                                  type="time"
                                  value={editingReport.expectedRestorationTime ? 
                                    `${editingReport.expectedRestorationTime.getHours().toString().padStart(2, '0')}:${editingReport.expectedRestorationTime.getMinutes().toString().padStart(2, '0')}` : 
                                    '00:00'}
                                  onChange={(e) => {
                                    if (!editingReport.expectedRestorationTime) return;
                                    const [hours, minutes] = e.target.value.split(':').map(Number);
                                    const newDate = new Date(editingReport.expectedRestorationTime);
                                    newDate.setHours(hours, minutes);
                                    setEditingReport(prev => prev ? {
                                      ...prev,
                                      expectedRestorationTime: newDate
                                    } : null);
                                  }}
                                  className="bg-[#151820] border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
                                />
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <div className="text-xs text-amber-400">
                          ⚠️ Required - Set estimated resolution time
                        </div>
                      </div>
                    ) : (
                      <span className="text-blue-400 font-semibold">
                        {report.expectedRestorationTime ? formatDateTime(report.expectedRestorationTime) : 'Not set'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {editingReport?.id === report.id ? (
                      <div className="space-y-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full justify-start text-left font-normal bg-[#151820] border-gray-700 text-gray-300 hover:bg-[#1e2230]',
                                !editingReport.mandatoryRestorationTime && 'text-muted-foreground'
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {editingReport.mandatoryRestorationTime ? 
                                format(editingReport.mandatoryRestorationTime, 'PPPp') : 
                                <span>Pick a date and time</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-[#1e2230] border-gray-700">
                            <Calendar
                              mode="single"
                              selected={editingReport.mandatoryRestorationTime || undefined}
                              onSelect={(date) => {
                                if (date) {
                                  const current = editingReport.mandatoryRestorationTime || new Date();
                                  date.setHours(current.getHours(), current.getMinutes(), 0, 0);
                                  setEditingReport(prev => prev ? {
                                    ...prev,
                                    mandatoryRestorationTime: date
                                  } : null);
                                }
                              }}
                              className="bg-[#1e2230] text-white"
                              classNames={{
                                day_selected: 'bg-cyan-600 hover:bg-cyan-700',
                                day_today: 'bg-gray-700 text-white',
                                day_disabled: 'text-gray-500',
                                day_outside: 'text-gray-500',
                              }}
                              initialFocus
                            />
                            <div className="p-3 border-t border-gray-700">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-300">Time:</span>
                                <input
                                  type="time"
                                  value={editingReport.mandatoryRestorationTime ? 
                                    `${editingReport.mandatoryRestorationTime.getHours().toString().padStart(2, '0')}:${editingReport.mandatoryRestorationTime.getMinutes().toString().padStart(2, '0')}` : 
                                    '00:00'}
                                  onChange={(e) => {
                                    if (!editingReport.mandatoryRestorationTime) return;
                                    const [hours, minutes] = e.target.value.split(':').map(Number);
                                    const newDate = new Date(editingReport.mandatoryRestorationTime);
                                    newDate.setHours(hours, minutes);
                                    setEditingReport(prev => prev ? {
                                      ...prev,
                                      mandatoryRestorationTime: newDate
                                    } : null);
                                  }}
                                  className="bg-[#151820] border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
                                />
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <div className="text-xs text-amber-400">
                          ⚠️ Required - Set SLA deadline
                        </div>
                      </div>
                    ) : (
                      <span className="text-red-400 font-semibold">
                        {report.mandatoryRestorationTime ? formatDateTime(report.mandatoryRestorationTime) : 'Not set'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {report.supervisor || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {editingReport?.id === report.id ? (
                      <select
                        value={editingReport.rootCause || ''}
                        onChange={(e) => setEditingReport(prev => prev ? { ...prev, rootCause: e.target.value as any } : null)}
                        className="w-full bg-[#151820] border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
                      >
                        <option value="">Select Root Cause</option>
                        <option value="Generator">Generator</option>
                        <option value="Transmission">Transmission</option>
                        <option value="Radio">Radio</option>
                        <option value="Environment">Environment</option>
                        <option value="Others">Others</option>
                      </select>
                    ) : (
                      <span className="italic text-yellow-300">{report.rootCause || 'Not specified'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {editingReport?.id === report.id ? (
                      <input
                        type="text"
                        value={editingReport.subrootCause || ''}
                        onChange={(e) => setEditingReport(prev => prev ? { ...prev, subrootCause: e.target.value } : null)}
                        placeholder="e.g., Fuel pump failure"
                        className="w-full bg-[#151820] border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
                      />
                    ) : (
                      <span className="italic text-yellow-300">{report.subrootCause || 'Not specified'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {editingReport?.id === report.id ? (
                      <input
                        type="text"
                        value={editingReport.username || ''}
                        onChange={(e) => setEditingReport(prev => prev ? { ...prev, username: e.target.value } : null)}
                        placeholder="Enter your username"
                        className="w-full bg-[#151820] border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
                      />
                    ) : (
                      <span>{report.username || 'N/A'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    {editingReport?.id === report.id ? (
                      <input
                        type="datetime-local"
                        value={editingReport.resolutionTime ? editingReport.resolutionTime.toISOString().slice(0, 16) : ''}
                        onChange={(e) => setEditingReport(prev => prev ? {
                          ...prev,
                          resolutionTime: e.target.value ? new Date(e.target.value) : undefined
                        } : null)}
                        className="w-full bg-[#151820] border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
                      />
                    ) : (
                      report.resolutionTime ? formatDateTime(report.resolutionTime) : 'Not Resolved'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {editingReport?.id === report.id ? (
                      <div className="space-y-1">
                        <select
                          value={editingReport.status || ''}
                          onChange={(e) => setEditingReport(prev => prev ? { ...prev, status: e.target.value as any } : null)}
                          className="w-full bg-[#151820] border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none"
                        >
                          <option value="In Progress">In Progress</option>
                          <option value="Resolved">Resolved</option>
                        </select>
                      </div>
                    ) : (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(report.status)}`}>
                        {report.status || 'Unknown'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {editingReport?.id === report.id ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={handleSaveEdit}
                          className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEdit(report)}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {reports.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">No outage reports found matching the current filters.</p>
        </div>
      )}
    </div>
  );
};
