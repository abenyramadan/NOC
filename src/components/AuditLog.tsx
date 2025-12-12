import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { getAuditLogs, AuditLog as AuditLogType, AuditLogFilters } from '../services/auditService';
import { useAuth } from '@/contexts/AuthContext';

export const AuditLog: React.FC = () => {
  const { user } = useAuth();
  const [auditLogs, setAuditLogs] = useState<AuditLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  
  // Filters
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // Check if user is admin - only admins can view audit logs
  const isAdmin = user?.role === 'admin';
  
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Access Denied</h2>
          <p className="text-muted-foreground mt-1">You don't have permission to view audit logs</p>
        </div>
        <div className="bg-yellow-500/20 border border-yellow-500 text-yellow-400 px-4 py-3 rounded">
          Only administrators can access the audit logs. Please contact your system administrator if you need access.
        </div>
      </div>
    );
  }

  const exportAuditLogs = async () => {
    try {
      // Get all logs with current filters (remove pagination for export)
      const exportFilters: AuditLogFilters = {
        sortBy: 'timestamp',
        sortOrder: 'desc',
        limit: 10000 // Reasonable limit for export
      };
      
      if (userFilter) exportFilters.user = userFilter;
      if (actionFilter) exportFilters.action = actionFilter;
      if (statusFilter && statusFilter !== 'all') exportFilters.status = statusFilter;
      if (startDate) exportFilters.startDate = startDate;
      if (endDate) exportFilters.endDate = endDate;
      
      const response = await getAuditLogs(exportFilters);
      const logs = response.auditLogs || [];
      
      // Convert to CSV
      const headers = ['Timestamp', 'User', 'Action', 'Details', 'Status'];
      const csvContent = [
        headers.join(','),
        ...logs.map(log => [
          `"${format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}"`,
          `"${log.user}"`,
          `"${log.action}"`,
          `"${formatAuditDetails(log.details, log.action).replace(/"/g, '""')}"`,
          `"${log.status}"`
        ].join(','))
      ].join('\n');
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `audit-logs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Export failed:', error);
      // Could add error notification here
    }
  };

  const toggleExpanded = (logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const formatAuditDetails = (details: string, action: string) => {
    try {
      const parsed = JSON.parse(details);

      // Handle different action types with specific formatting
      if (action.includes('outage:update') && parsed.changes) {
        // Format outage update changes
        const changes = parsed.changes.map((change: any) => {
          const fieldName = formatFieldName(change.field);
          const oldValue = formatFieldValue(change.field, change.oldValue);
          const newValue = formatFieldValue(change.field, change.newValue);

          // Special formatting for status changes
          if (change.field === 'status') {
            return `${fieldName}: ${oldValue} → ${newValue}`;
          }

          // For other fields, show concise changes
          if (oldValue === 'not set' && newValue !== 'not set') {
            return `${fieldName} set to ${newValue}`;
          } else if (oldValue !== 'not set' && newValue === 'not set') {
            return `${fieldName} cleared`;
          } else {
            return `${fieldName}: ${newValue}`;
          }
        }).filter(change => change).join(' • ');

        const report = parsed.report;
        const siteInfo = report.siteCode || report.siteNo || 'Unknown site';
        return `${siteInfo} (${report.region || 'Unknown region'}): ${changes}`;
      }

      if (action.includes('outage:create')) {
        const siteInfo = parsed.siteCode || parsed.siteNo || 'Unknown site';
        const region = parsed.region || 'Unknown region';
        return `New report: ${siteInfo} (${region})`;
      }

      if (action.includes('outage:delete')) {
        const siteInfo = parsed.siteCode || parsed.siteNo || parsed.id || 'Unknown';
        return `Deleted: ${siteInfo}`;
      }

      if (action.includes('login')) {
        return 'Logged in';
      }

      if (action.includes('logout')) {
        return 'Logged out';
      }

      // Generic fallback for other actions
      if (typeof parsed === 'object') {
        const keys = Object.keys(parsed);
        if (keys.length === 1) {
          const key = formatFieldName(keys[0]);
          const value = formatFieldValue(keys[0], parsed[keys[0]]);
          return `${key}: ${value}`;
        } else if (keys.length > 1) {
          const keyValues = keys.map(key => {
            const formattedKey = formatFieldName(key);
            const value = formatFieldValue(key, parsed[key]);
            return `${formattedKey}: ${value}`;
          });
          return keyValues.join(' • ');
        }
      }

      return details; // Fallback to raw details
    } catch (e) {
      // If not JSON, return as-is
      return details;
    }
  };

  const formatFieldName = (field: string): string => {
    // Map common field names to user-friendly names
    const fieldMappings: Record<string, string> = {
      siteCode: 'Site Code',
      siteNo: 'Site Number',
      region: 'Region',
      alarmType: 'Alarm Type',
      occurrenceTime: 'Start Time',
      resolutionTime: 'End Time',
      status: 'Status',
      rootCause: 'Root Cause',
      supervisor: 'Supervisor',
      description: 'Description',
      comments: 'Comments',
      mandatoryRestorationTime: 'Mandatory Fix Time',
      expectedResolutionHours: 'Expected Hours'
    };

    if (fieldMappings[field]) {
      return fieldMappings[field];
    }

    // Convert camelCase to readable format
    return field.replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase())
                .trim();
  };

  const formatFieldValue = (field: string, value: any): string => {
    if (value === null || value === undefined) {
      return 'not set';
    }

    // Special handling for status field
    if (field === 'status') {
      const statusMappings: Record<string, string> = {
        'Open': 'Open',
        'In Progress': 'In Progress',
        'Resolved': 'Resolved',
        'Closed': 'Closed'
      };
      return statusMappings[value] || value;
    }

    // Special handling for time fields
    if (field.toLowerCase().includes('time') && value) {
      try {
        const date = new Date(value);
        // For audit logs, show relative time if recent, otherwise date/time
        const now = new Date();
        const diffMinutes = (now.getTime() - date.getTime()) / (1000 * 60);

        if (diffMinutes < 60) {
          return `${Math.floor(diffMinutes)}m ago`;
        } else if (diffMinutes < 1440) { // 24 hours
          return `${Math.floor(diffMinutes / 60)}h ago`;
        } else {
          return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
      } catch {
        return String(value);
      }
    }

    // Handle boolean values
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    return String(value);
  };

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const filters: AuditLogFilters = {
        page: currentPage,
        limit: 50,
        sortBy: 'timestamp',
        sortOrder: 'desc'
      };
      
      if (userFilter) filters.user = userFilter;
      if (actionFilter) filters.action = actionFilter;
      if (statusFilter && statusFilter !== 'all') filters.status = statusFilter;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      
      const response = await getAuditLogs(filters);
      setAuditLogs(response.auditLogs || []);
      setTotalPages(response.pagination?.total || 1);
      setTotalLogs(response.pagination?.totalLogs || 0);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load audit logs');
      setError(error);
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, userFilter, actionFilter, statusFilter, startDate, endDate]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Audit Log</h2>
          <p className="text-muted-foreground mt-1">Track all user actions and system events</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    // Check if the error is due to insufficient permissions
    const errorMessage = error.message || '';
    const isPermissionError = errorMessage.includes('403') || 
                              errorMessage.toLowerCase().includes('permission') ||
                              errorMessage.toLowerCase().includes('unauthorized');
    
    if (isPermissionError) {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Access Denied</h2>
            <p className="text-muted-foreground mt-1">You don't have permission to view audit logs</p>
          </div>
          <div className="bg-yellow-500/20 border border-yellow-500 text-yellow-400 px-4 py-3 rounded">
            Only administrators can access the audit logs. Please contact your system administrator if you need access.
          </div>
        </div>
      );
    }

    // Show error but still allow retry
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Audit Log</h2>
          <p className="text-muted-foreground mt-1">Track all user actions and system events</p>
        </div>
        <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded flex items-center justify-between">
          <span>{errorMessage || 'Failed to load audit logs'}</span>
          <button
            onClick={() => {
              setError(null);
              fetchAuditLogs();
            }}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Audit Log</h2>
        <p className="text-muted-foreground mt-1">Track all user actions and system events</p>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-lg font-semibold text-foreground mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-2">User</label>
            <input
              type="text"
              value={userFilter}
              onChange={(e) => { setUserFilter(e.target.value); setCurrentPage(1); }}
              placeholder="Filter by user..."
              className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Action</label>
            <input
              type="text"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setCurrentPage(1); }}
              placeholder="Filter by action..."
              className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
              className="w-full bg-background border border-input rounded px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              setUserFilter('');
              setActionFilter('');
              setStatusFilter('all');
              setStartDate('');
              setEndDate('');
              setCurrentPage(1);
            }}
            className="px-4 py-2 bg-accent hover:bg-accent/90 text-accent-foreground text-sm rounded transition-colors"
          >
            Clear Filters
          </button>
          <button
            onClick={exportAuditLogs}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={fetchAuditLogs}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm rounded transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Audit Logs</h3>
          <p className="text-sm text-muted-foreground">Showing {auditLogs.length} of {totalLogs} logs</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-background border-b border-border">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Timestamp</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">User</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Action</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Details</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                auditLogs.map(log => {
                  const formattedDetails = formatAuditDetails(log.details, log.action);
                  const shouldTruncate = formattedDetails.length > 100;
                  const truncatedDetails = shouldTruncate ? formattedDetails.substring(0, 100) + '...' : formattedDetails;
                  const isExpanded = expandedLogs.has(log._id);

                  return (
                    <React.Fragment key={log._id}>
                      <tr className="border-b border-border hover:bg-accent">
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {format(new Date(log.timestamp), 'dd/MMM/yyyy HH:mm')}
                        </td>
                        <td className="px-6 py-4 text-sm text-foreground font-mono">{log.user}</td>
                        <td className="px-6 py-4 text-sm text-primary">{log.action}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <span>{truncatedDetails}</span>
                            {shouldTruncate && (
                              <button
                                onClick={() => toggleExpanded(log._id)}
                                className="text-primary hover:text-primary/80 text-xs font-medium underline"
                              >
                                {isExpanded ? 'See less' : 'See more'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs ${
                            log.status === 'success' 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-accent/20">
                          <td colSpan={5} className="px-6 py-3">
                            <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                  <span className="text-primary text-sm font-medium">
                                    {log.action.includes('outage') ? '📋' : 
                                     log.action.includes('login') ? '🔐' : 
                                     log.action.includes('logout') ? '🚪' : '⚡'}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h4 className="text-sm font-semibold text-foreground">Action Details</h4>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      log.status === 'success' 
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                    }`}>
                                      {log.status}
                                    </span>
                                  </div>
                                  <div className="text-sm text-muted-foreground leading-relaxed">
                                    {formattedDetails}
                                  </div>
                                  <div className="mt-3 pt-3 border-t border-border/50">
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                      <span>User: <span className="font-mono">{log.user}</span></span>
                                      <span>Action: <span className="font-medium">{log.action}</span></span>
                                      <span>{format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm')}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-accent hover:bg-accent/90 text-accent-foreground text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
