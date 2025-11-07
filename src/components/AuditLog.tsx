import React, { useState, useEffect } from 'react';
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

  // Check if user is admin - only admins can view audit logs
  const isAdmin = user?.role === 'admin';
  
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Access Denied</h2>
          <p className="text-gray-400 mt-1">You don't have permission to view audit logs</p>
        </div>
        <div className="bg-yellow-500/20 border border-yellow-500 text-yellow-400 px-4 py-3 rounded">
          Only administrators can access the audit logs. Please contact your system administrator if you need access.
        </div>
      </div>
    );
  }

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
          <h2 className="text-2xl font-bold text-white">Audit Log</h2>
          <p className="text-gray-400 mt-1">Track all user actions and system events</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
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
            <h2 className="text-2xl font-bold text-white">Access Denied</h2>
            <p className="text-gray-400 mt-1">You don't have permission to view audit logs</p>
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
          <h2 className="text-2xl font-bold text-white">Audit Log</h2>
          <p className="text-gray-400 mt-1">Track all user actions and system events</p>
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
        <h2 className="text-2xl font-bold text-white">Audit Log</h2>
        <p className="text-gray-400 mt-1">Track all user actions and system events</p>
      </div>

      {/* Filters */}
      <div className="bg-[#1e2230] rounded-lg border border-gray-800 p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">User</label>
            <input
              type="text"
              value={userFilter}
              onChange={(e) => { setUserFilter(e.target.value); setCurrentPage(1); }}
              placeholder="Filter by user..."
              className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Action</label>
            <input
              type="text"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setCurrentPage(1); }}
              placeholder="Filter by action..."
              className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
              className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
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
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
          >
            Clear Filters
          </button>
          <button
            onClick={fetchAuditLogs}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-[#1e2230] rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Audit Logs</h3>
          <p className="text-sm text-gray-400">Showing {auditLogs.length} of {totalLogs} logs</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#151820] border-b border-gray-800">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Timestamp</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">User</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Action</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Target</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Details</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                auditLogs.map(log => (
                  <tr key={log._id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-white font-mono">{log.user}</td>
                    <td className="px-6 py-4 text-sm text-cyan-400">{log.action}</td>
                    <td className="px-6 py-4 text-sm text-gray-300 font-mono">{log.target}</td>
                    <td className="px-6 py-4 text-sm text-gray-400 max-w-xs truncate" title={log.details}>{log.details}</td>
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
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between">
            <div className="text-sm text-gray-400">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
