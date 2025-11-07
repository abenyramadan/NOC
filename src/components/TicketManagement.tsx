import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Ticket {
  id: string;
  alarmId: string;
  siteName: string;
  siteId: string;
  severity: 'critical' | 'major' | 'minor';
  alarmType: string;
  description: string;
  recipients: string[];
  emailSentAt: Date;
  status: 'sent' | 'failed' | 'pending' | 'resolved';
  emailSubject: string;
  createdBy: {
    username: string;
    name: string;
  };
  resolvedAt?: Date;
  notes?: string;
}

interface TicketService {
  getAllTickets(params?: {
    status?: string;
    severity?: string;
    siteId?: string;
    alarmType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<Ticket[]>;
  deleteTicket(id: string): Promise<void>;
  resolveTicket(id: string, notes?: string): Promise<Ticket>;
}

class TicketManagementService {
  private getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    console.log('Auth token exists:', !!token);
    console.log('Token length:', token?.length || 0);

    if (token) {
      console.log('Token preview:', token.substring(0, 50) + '...');

      // Check if token looks like a JWT (should have 3 parts separated by dots)
      const tokenParts = token.split('.');
      console.log('Token parts:', tokenParts.length);

      if (tokenParts.length === 3) {
        try {
          // Decode payload to check expiration
          const payload = JSON.parse(atob(tokenParts[1]));
          const expirationTime = payload.exp * 1000; // Convert to milliseconds
          const currentTime = Date.now();
          const isExpired = currentTime >= expirationTime;

          console.log('Token expiration:', new Date(expirationTime).toLocaleString());
          console.log('Current time:', new Date(currentTime).toLocaleString());
          console.log('Token expired:', isExpired);

          if (isExpired) {
            console.log('🗑️ Removing expired token');
            localStorage.removeItem('authToken');
            throw new Error('Authentication token has expired. Please log in again.');
          }
        } catch (error) {
          console.error('Error checking token expiration:', error);
          localStorage.removeItem('authToken');
          throw new Error('Invalid authentication token. Please log in again.');
        }
      } else {
        console.error('❌ Invalid token format - should have 3 parts separated by dots');
        localStorage.removeItem('authToken');
        throw new Error('Invalid authentication token format. Please log in again.');
      }
    }

    if (!token) {
      throw new Error('No authentication token found. Please log in first.');
    }

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async getAllTickets(params?: {
    status?: string;
    severity?: string;
    siteId?: string;
    alarmType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<Ticket[]> {
    try {
      const queryParams = new URLSearchParams();

      if (params?.status && params.status !== 'all') queryParams.append('status', params.status);
      if (params?.severity && params.severity !== 'all') queryParams.append('severity', params.severity);
      if (params?.siteId) queryParams.append('siteId', params.siteId);
      if (params?.alarmType) queryParams.append('alarmType', params.alarmType);
      if (params?.startDate) queryParams.append('startDate', params.startDate);
      if (params?.endDate) queryParams.append('endDate', params.endDate);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);

      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/tickets${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });

        if (response.status === 403) {
          throw new Error(`403 Forbidden: ${errorText || 'Access denied'}`);
        }
        throw new Error('Failed to fetch tickets');
      }

      const data = await response.json();
      // Handle both response formats: data.tickets or direct array
      const ticketsArray = data.tickets || data || [];
      console.log('Tickets received:', ticketsArray.length);
      return ticketsArray;
    } catch (error) {
      console.error('Error fetching tickets:', error);
      throw error;
    }
  }

  async deleteTicket(id: string): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/tickets/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to delete ticket');
      }
    } catch (error) {
      console.error('Error deleting ticket:', error);
      throw error;
    }
  }

  async resolveTicket(id: string, notes?: string): Promise<Ticket> {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/tickets/${id}/resolve`, {
        method: 'PATCH',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ notes }),
      });

      if (!response.ok) {
        throw new Error('Failed to resolve ticket');
      }

      const data = await response.json();
      return data.ticket;
    } catch (error) {
      console.error('Error resolving ticket:', error);
      throw error;
    }
  }
}

const ticketService = new TicketManagementService();

export const TicketManagement: React.FC = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedHour, setSelectedHour] = useState<string>(new Date().getHours().toString());
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    if (user && user.role) {
      console.log('User authenticated:', user.username, 'Role:', user.role);

      // Check if user has permission to view tickets
      const canViewTickets = ['admin', 'engineer', 'operator'].includes(user.role);
      if (!canViewTickets) {
        console.log('User role does not have tickets permission:', user.role);
        setError('You do not have permission to view tickets');
        setLoading(false);
        return;
      }

      fetchTickets();
    } else {
      console.log('User not authenticated or missing role');
      setError('Please log in to view tickets');
      setLoading(false);
    }
  }, [user]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError(null);
      const ticketData = await ticketService.getAllTickets({
        limit: 100,
        sortBy: 'emailSentAt',
        sortOrder: 'desc'
      });

      // Handle empty results gracefully
      if (!ticketData || ticketData.length === 0) {
        console.log('No tickets found - this is normal for new installations');
        setTickets([]);
        setLoading(false);
        return;
      }

      setTickets(ticketData);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      if (err.message.includes('expired') || err.message.includes('Invalid')) {
        setError('Your session has expired. Please log in again.');
      } else if (err.message.includes('No authentication token')) {
        setError('Please log in to view tickets');
      } else if (err.message.includes('403')) {
        setError('You do not have permission to view tickets. Check your role.');
      } else {
        setError('Failed to load tickets');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTicket = async (id: string) => {
    if (!confirm('Are you sure you want to delete this ticket?')) return;

    try {
      await ticketService.deleteTicket(id);
      setTickets(tickets.filter(t => t.id !== id));
    } catch (err) {
      console.error('Error deleting ticket:', err);
      alert('Failed to delete ticket');
    }
  };

  const handleResolveTicket = async () => {
    if (!selectedTicket) return;

    try {
      await ticketService.resolveTicket(selectedTicket.id, resolveNotes);
      setTickets(tickets.map(t =>
        t.id === selectedTicket.id
          ? { ...t, status: 'resolved', resolvedAt: new Date(), notes: resolveNotes }
          : t
      ));
      setShowResolveDialog(false);
      setSelectedTicket(null);
      setResolveNotes('');
    } catch (err) {
      console.error('Error resolving ticket:', err);
      alert('Failed to resolve ticket');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-green-500/20 text-green-400';
      case 'failed': return 'bg-red-500/20 text-red-400';
      case 'pending': return 'bg-yellow-500/20 text-yellow-400';
      case 'resolved': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'major': return 'bg-orange-500';
      case 'minor': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  // Filter tickets by date and hour
  const filteredTickets = React.useMemo(() => {
    if (showAllHistory) {
      return tickets;
    }

    return tickets.filter(ticket => {
      const ticketDate = new Date(ticket.emailSentAt).toISOString().split('T')[0];
      if (ticketDate !== selectedDate) return false;

      // Hour filtering - only apply if specific hour is selected
      if (selectedHour !== 'all') {
        const ticketHour = new Date(ticket.emailSentAt).getHours();
        if (ticketHour !== parseInt(selectedHour)) return false;
      }

      return true;
    });
  }, [tickets, selectedDate, selectedHour, showAllHistory]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Ticket Management</h2>
          <p className="text-gray-400 mt-1">Track email notifications and their status</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Ticket Management</h2>
          <p className="text-gray-400 mt-1">Track email notifications and their status</p>
        </div>
        <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded">
          <div className="font-semibold">Authentication Error</div>
          <div className="mt-2">{error}</div>
          {user && (
            <div className="mt-3 text-sm">
              <div>Current User: {user.username}</div>
              <div>Role: {user.role}</div>
              <div>Authenticated: {user ? 'Yes' : 'No'}</div>
            </div>
          )}
          <div className="mt-3 text-sm text-gray-300">
            <div>🔑 <strong>Solution:</strong> Please log out and log back in to refresh your authentication token</div>
            <div>📍 Go to: <code>http://localhost:8081/login</code></div>
            <div>👤 Use your credentials to login again</div>
          </div>
          <div className="mt-4">
            <button
              onClick={() => window.location.href = '/login'}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Ticket Management</h2>
        <p className="text-gray-400 mt-1">Track email notifications and their status</p>
      </div>

      {/* Date and Hour Filter Controls */}
      <div className="bg-[#1e2230] rounded-lg p-4 border border-gray-800">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-300">📅 Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={showAllHistory}
              className="bg-[#151820] border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-300">🕐 Hour:</label>
            <select
              value={selectedHour}
              onChange={(e) => setSelectedHour(e.target.value)}
              disabled={showAllHistory}
              className="bg-[#151820] border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-300 focus:border-cyan-500 focus:outline-none disabled:opacity-50"
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
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ticketShowAllHistory"
              checked={showAllHistory}
              onChange={(e) => {
                setShowAllHistory(e.target.checked);
                if (e.target.checked) {
                  setSelectedHour('all');
                }
              }}
              className="w-4 h-4 text-cyan-600 bg-[#151820] border-gray-700 rounded focus:ring-cyan-500"
            />
            <label htmlFor="ticketShowAllHistory" className="text-sm font-medium text-gray-300 cursor-pointer">
              Show All History
            </label>
          </div>
          <div className="text-sm text-cyan-400 ml-auto font-medium">
            {showAllHistory 
              ? '📊 Viewing all historical tickets' 
              : selectedHour === 'all'
                ? `📊 ${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
                : `📊 ${new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} from ${selectedHour.padStart(2, '0')} to ${((parseInt(selectedHour) + 1) % 24).toString().padStart(2, '0')}`
            }
          </div>
        </div>
        <div className="text-sm text-gray-400 mt-2">
          Showing {filteredTickets.length} of {tickets.length} tickets
        </div>
      </div>

      {filteredTickets.length === 0 ? (
        <div className="bg-[#1e2230] rounded-lg border border-gray-800 p-8 text-center">
          <div className="text-6xl mb-4">🎫</div>
          <h3 className="text-xl font-semibold text-white mb-2">No Tickets Yet</h3>
          <p className="text-gray-400 mb-4">
            Email notification tickets will appear here when alarms are triggered and emails are sent.
          </p>
          <div className="text-sm text-gray-500">
            <p>Tickets are automatically created when:</p>
            <ul className="mt-2 space-y-1">
              {[
                'New alarms are created',
                'Email notifications are sent',
                'Alarm status changes'
              ].map((item, index) => (
                <li key={`ticket-info-${index}`} className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="bg-[#1e2230] rounded-lg border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#151820] border-b border-gray-800">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Timestamp</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Site</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Severity</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Recipients</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map(ticket => (
                  <tr key={ticket.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {ticket.emailSentAt.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm text-white font-medium">{ticket.siteName}</div>
                        <div className="text-xs text-gray-400">{ticket.siteId}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${getSeverityColor(ticket.severity)}`}>
                        {ticket.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {ticket.recipients.map((recipient, idx) => (
                          <span key={`${ticket.id}-${idx}`} className="text-sm text-gray-400">
                            {recipient}{idx < ticket.recipients.length - 1 ? ',' : ''}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(ticket.status)}`}>
                        {ticket.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resolve Dialog */}
      {showResolveDialog && selectedTicket && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#1e2230] rounded-lg border border-gray-800 p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-4">Resolve Ticket</h3>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Notes (Optional)</label>
              <textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-white text-sm"
                rows={3}
                placeholder="Add resolution notes..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowResolveDialog(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResolveTicket}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
