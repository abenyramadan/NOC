import React, { useState, useEffect } from 'react';
import { Calendar } from './ui/calendar';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { outageReportService, OutageReport, OutageReportFilters } from '../services/outageReportService';
import OutageTable from './OutageTable';

export const OutageReports: React.FC = () => {
  const [reports, setReports] = useState<OutageReport[]>([]);
  const [carryOverReports, setCarryOverReports] = useState<OutageReport[]>([]);
  const [todayReports, setTodayReports] = useState<OutageReport[]>([]);
  const [resolvedTodayReports, setResolvedTodayReports] = useState<OutageReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<OutageReport | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(''); // Empty means latest reports
  const [filters, setFilters] = useState<OutageReportFilters>({
    page: 1,
    limit: 50,
    status: 'all',
    region: 'all',
    alarmType: 'all',
    sortBy: 'status', // Prioritize active outages first
    sortOrder: 'asc'  // 'In Progress' comes before 'Resolved' alphabetically
  });

  useEffect(() => {
    fetchReports();
  }, [filters, selectedDate]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await outageReportService.getOutageReports({
        ...filters,
        limit: 1000,
        sortBy: 'occurrenceTime',
        sortOrder: 'desc',
      });

      const processedReports = response.reports.map((report) => ({
        ...report,
        occurrenceTime: new Date(report.occurrenceTime),
        expectedRestorationTime: report.expectedRestorationTime ? new Date(report.expectedRestorationTime) : undefined,
        mandatoryRestorationTime: report.mandatoryRestorationTime ? new Date(report.mandatoryRestorationTime) : undefined,
        resolutionTime: report.resolutionTime ? new Date(report.resolutionTime) : undefined,
        createdAt: new Date(report.createdAt),
        updatedAt: new Date(report.updatedAt),
      }));

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // Today's ongoing outages: Occurred today AND still in progress
      const ongoingToday = processedReports.filter((r) => {
        const occurredToday = r.occurrenceTime >= startOfToday;
        const isInProgress = ['In Progress', 'Open'].includes(r.status);
        return occurredToday && isInProgress;
      });

      // Resolved today outages: Were resolved today (regardless of when they occurred)
      const resolvedToday = processedReports.filter((r) => {
        const isResolved = ['Resolved', 'Closed'].includes(r.status);
        const resolvedTodayCheck = r.resolutionTime && new Date(r.resolutionTime) >= startOfToday;
        return isResolved && resolvedTodayCheck;
      });

      // Carry-over outages: Only outages that occurred before today AND are still active
      const carryOvers = processedReports.filter(
        (r) =>
          r.occurrenceTime < startOfToday &&
          ['In Progress', 'Open'].includes(r.status)
      );

      setTodayReports(ongoingToday);
      setResolvedTodayReports(resolvedToday);
      setCarryOverReports(carryOvers);
      setReports(processedReports);
    } catch (err) {
      console.error('Failed to fetch outage reports:', err);
      setError(err instanceof Error ? err.message : 'Failed to load outage reports');
      setReports([]);
      setCarryOverReports([]);
      setTodayReports([]);
      setResolvedTodayReports([]);
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

      // Update local state in all report categories
      setReports(prev => prev.map(r =>
        r.id === editingReport.id ? editingReport : r
      ));
      setCarryOverReports(prev => prev.map(r =>
        r.id === editingReport.id ? editingReport : r
      ));
      setTodayReports(prev => prev.map(r =>
        r.id === editingReport.id ? editingReport : r
      ));
      setResolvedTodayReports(prev => prev.map(r =>
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
    return format(d, 'dd/MMM/yyyy HH:mm:ss');
  };

  const formatCarryOverDate = (date: Date | string | null | undefined) => {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';
    // Format as dd/MMM/yyyy HH:mm (e.g., 10/Nov/2025 14:30)
    return format(d, 'dd/MMM/yyyy HH:mm');
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
        <h2 className="text-3xl font-bold text-foreground mb-2">NOCALERT Outage Reports</h2>
        <p className="text-muted-foreground">View and manage outage reports - shows latest active outages by default</p>
      </div>

      {/* Date and Hour Filters */}
      <div className="bg-card rounded-lg p-4 border border-border mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-muted-foreground mb-2">📅 Date</label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'flex-1 justify-start text-left font-normal',
                      !selectedDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(new Date(selectedDate), 'dd/MMM/yyyy') : <span>Show Latest Reports</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate ? new Date(selectedDate) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date.toISOString().split('T')[0]);
                      } else {
                        setSelectedDate(''); // Clear date to show latest
                      }
                    }}
                    className=""
                    classNames={{
                      day_selected: 'bg-primary hover:bg-primary/90',
                      day_today: 'bg-accent text-accent-foreground',
                      day_disabled: 'text-muted-foreground',
                      day_outside: 'text-muted-foreground',
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {selectedDate && (
                <Button
                  variant="outline"
                  onClick={() => setSelectedDate('')}
                  className="px-3"
                  title="Clear date filter to show latest reports"
                >
                  ✕
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 flex items-end">
            <div className="text-sm text-primary font-medium">
              {selectedDate ? (
                `📊 Viewing all reports for ${format(new Date(selectedDate), 'dd/MMM/yyyy')}`
              ) : (
                `📊 Showing latest ${reports.length} outage reports (most recent first)`
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg p-4 border border-border mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            
            </select>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-2">Region</label>
            <select
              value={filters.region}
              onChange={(e) => handleFilterChange('region', e.target.value)}
              className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Regions</option>
              <option value="Bahr gha zal">Bahr gha zal</option>
              <option value="Equatoria">Equatoria</option>
              <option value="Upper Nile">Upper Nile</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-2">Alarm Type</label>
            <select
              value={filters.alarmType}
              onChange={(e) => handleFilterChange('alarmType', e.target.value)}
              className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
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
            <label className="block text-xs text-muted-foreground mb-2">Sort By</label>
            <select
              value={`${filters.sortBy}-${filters.sortOrder}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split('-');
                handleFilterChange('sortBy', sortBy);
                handleFilterChange('sortOrder', sortOrder);
              }}
              className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="status-asc">Active First (In Progress → Resolved)</option>
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

      {/* Report Sections */}
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">⚡ Carry-Over Outages</h2>
          <p className="text-muted-foreground mb-4">Ongoing outages from previous days (still unresolved)</p>
          {carryOverReports.length > 0 ? (
            <OutageTable
              reports={carryOverReports}
              editingReport={editingReport}
              setEditingReport={setEditingReport}
              onEdit={handleEdit}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          ) : (
            <p className="text-muted-foreground italic">No carry-over outages 🎉</p>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">🔥 Today's Ongoing Outages</h2>
          <p className="text-muted-foreground mb-4">Incidents that started today and are still in progress</p>
          {todayReports.length > 0 ? (
            <OutageTable
              reports={todayReports}
              editingReport={editingReport}
              setEditingReport={setEditingReport}
              onEdit={handleEdit}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          ) : (
            <p className="text-muted-foreground italic">No ongoing outages from today.</p>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">✅ Resolved Today Outages</h2>
          <p className="text-muted-foreground mb-4">Outages that were resolved today (including carry-over outages resolved today)</p>
          {resolvedTodayReports.length > 0 ? (
            <OutageTable
              reports={resolvedTodayReports}
              editingReport={editingReport}
              setEditingReport={setEditingReport}
              onEdit={handleEdit}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          ) : (
            <p className="text-muted-foreground italic">No outages resolved today.</p>
          )}
        </div>
      </div>

      {todayReports.length === 0 && carryOverReports.length === 0 && resolvedTodayReports.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No outage reports found matching the current filters.</p>
        </div>
      )}
    </div>
  );
};
