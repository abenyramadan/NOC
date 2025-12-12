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
  }): Promise<{ tickets: Ticket[]; total: number }>;
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
  }): Promise<{ tickets: Ticket[]; total: number }> {
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

      const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const url = `${base}/api/tickets${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

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
      const totalCount = data.pagination?.totalTickets || data.pagination?.total || ticketsArray.length;
      console.log('Tickets received:', ticketsArray.length, 'of', totalCount, 'total');
      return { tickets: ticketsArray, total: totalCount };
    } catch (error) {
      console.error('Error fetching tickets:', error);
      throw error;
    }
  }

  async deleteTicket(id: string): Promise<void> {
    try {
      const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${base}/api/tickets/${id}`, {
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
      const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${base}/api/tickets/${id}/resolve`, {
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
  const [totalTickets, setTotalTickets] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showAllRecipients, setShowAllRecipients] = useState(false);

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

  // Listen for outage reports updates to refresh tickets when they are resolved
  useEffect(() => {
    const handleOutageReportsUpdate = () => {
      console.log('🎫 Tickets: Received outageReportsUpdated event - refreshing tickets');
      fetchTickets();
    };

    console.log('🎫 Tickets: Setting up outageReportsUpdated event listener');
    window.addEventListener('outageReportsUpdated', handleOutageReportsUpdate);

    // Cleanup event listener on unmount
    return () => {
      console.log('🎫 Tickets: Removing outageReportsUpdated event listener');
      window.removeEventListener('outageReportsUpdated', handleOutageReportsUpdate);
    };
  }, []);

  const fetchTickets = async () => {
    try {
      console.log('🎫 Tickets: Starting to fetch tickets...');
      setLoading(true);
      setError(null);
      const result = await ticketService.getAllTickets({
        limit: 100,
        sortBy: 'emailSentAt',
        sortOrder: 'desc'
      });

      const { tickets: ticketData, total } = result;
      console.log('🎫 Tickets: Received ticket data:', ticketData?.length || 0, 'tickets of', total, 'total');
      if (ticketData && ticketData.length > 0) {
        console.log('🎫 Tickets: Sample ticket:', {
          id: ticketData[0].id,
          status: ticketData[0].status,
          resolvedAt: ticketData[0].resolvedAt,
          emailSentAt: ticketData[0].emailSentAt
        });
      }

      // Handle empty results gracefully
      if (!ticketData || ticketData.length === 0) {
        console.log('🎫 Tickets: No tickets found - this is normal for new installations');
        setTickets([]);
        setTotalTickets(0);
        setLoading(false);
        return;
      }

      setTickets(ticketData);
      setTotalTickets(total);
      console.log('🎫 Tickets: Successfully set tickets data');
    } catch (err) {
      console.error('🎫 Tickets: Error fetching tickets:', err);
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
      console.log('🎫 Tickets: Fetch operation completed');
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
    switch (status.toLowerCase()) {
      case 'sent':
      case 'resolved':
      case 'closed':
        return 'bg-green-500/20 text-green-400 border-green-500';
      case 'failed':
        return 'bg-red-500/20 text-red-400 border-red-500';
      case 'pending':
      case 'in progress':
      case 'open':
      case 'acknowledged':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500';
      case 'active':
        return 'bg-red-500/20 text-red-400 border-red-500';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500';
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

  const isRecentlyResolved = (ticket: Ticket) => {
    const resolvedStatuses = ['resolved', 'closed'];
    if (!resolvedStatuses.includes(ticket.status.toLowerCase()) || !ticket.resolvedAt) return false;
    const resolvedTime = new Date(ticket.resolvedAt).getTime();
    const now = Date.now();
    const hoursSinceResolved = (now - resolvedTime) / (1000 * 60 * 60);
    return hoursSinceResolved <= 24; // Show "Recently Resolved" for 24 hours
  };

  // Filter tickets by date
  const filteredTickets = React.useMemo(() => {
    if (showAllHistory) {
      return tickets;
    }

    return tickets.filter(ticket => {
      const ticketDate = new Date(ticket.emailSentAt).toISOString().split('T')[0];
      if (ticketDate !== selectedDate) return false;

      return true;
    });
  }, [tickets, selectedDate, showAllHistory]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">Ticket Management</h2>
          <p className="text-muted-foreground">Track email notifications and their status</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Ticket Management</h2>
          <p className="text-muted-foreground mt-1">Track email notifications and their status</p>
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
          <div className="mt-3 text-sm text-muted-foreground">
            <div>🔑 <strong>Solution:</strong> Please log out and log back in to refresh your authentication token</div>
            <div>📍 Go to: <code>http://localhost:8081/login</code></div>
            <div>👤 Use your credentials to login again</div>
          </div>
          <div className="mt-4">
            <button
              onClick={() => window.location.href = '/login'}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors"
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
        <h2 className="text-3xl font-bold text-foreground mb-2">Ticket Management</h2>
        <p className="text-muted-foreground">Track email notifications and their status</p>
      </div>

      {/* Recipients Summary */}
      {filteredTickets.length > 0 && (
        <div className="bg-card rounded-lg p-4 border border-border">
          <h3 className="text-lg font-semibold text-foreground mb-3">📧 Email Recipients Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-accent/20 rounded-lg p-3">
              <div className="text-sm text-muted-foreground mb-1">Total Recipients</div>
              <div className="text-2xl font-bold text-foreground">
                {(() => {
                  const allRecipients = new Set<string>();
                  filteredTickets.forEach(ticket => {
                    ticket.recipients.forEach(recipient => allRecipients.add(recipient));
                  });
                  return allRecipients.size;
                })()}
              </div>
            </div>
            <div className="bg-accent/20 rounded-lg p-3">
              <div className="text-sm text-muted-foreground mb-1">Total Emails Sent</div>
              <div className="text-2xl font-bold text-foreground">{filteredTickets.length}</div>
            </div>
            <div className="bg-accent/20 rounded-lg p-3">
              <div className="text-sm text-muted-foreground mb-1">Average Recipients per Email</div>
              <div className="text-2xl font-bold text-foreground">
                {filteredTickets.length > 0
                  ? (filteredTickets.reduce((sum, ticket) => sum + ticket.recipients.length, 0) / filteredTickets.length).toFixed(1)
                  : '0'
                }
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm text-muted-foreground mb-2">
              Recipients for selected date ({(() => {
                const allRecipients = new Set<string>();
                filteredTickets.forEach(ticket => {
                  ticket.recipients.forEach(recipient => allRecipients.add(recipient));
                });
                return allRecipients.size;
              })()} total):
            </div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {(() => {
                const allRecipients = Array.from(new Set<string>(
                  filteredTickets.flatMap(ticket => ticket.recipients)
                )).sort();

                const displayRecipients = showAllRecipients ? allRecipients : allRecipients.slice(0, 8);

                return (
                  <>
                    {displayRecipients.map(recipient => (
                      <span key={recipient} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                        {recipient}
                      </span>
                    ))}
                    {allRecipients.length > 8 && (
                      <button
                        onClick={() => setShowAllRecipients(!showAllRecipients)}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-accent hover:bg-accent/80 text-accent-foreground border border-border whitespace-nowrap transition-colors"
                      >
                        {showAllRecipients ? 'Show Less' : `+${allRecipients.length - 8} More`}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Date Filter Controls */}
      <div className="bg-card rounded-lg p-4 border border-border">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">📅 Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={showAllHistory}
              className="bg-background border border-input rounded px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ticketShowAllHistory"
              checked={showAllHistory}
              onChange={(e) => setShowAllHistory(e.target.checked)}
              className="w-4 h-4 text-primary bg-background border-input rounded focus:ring-primary"
            />
            <label htmlFor="ticketShowAllHistory" className="text-sm font-medium text-foreground cursor-pointer">
              Show All History
            </label>
          </div>
          <div className="text-sm text-primary ml-auto font-medium">
            {showAllHistory 
              ? '📊 Viewing all historical tickets' 
              : `📊 ${new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
            }
          </div>
        </div>
        <div className="text-sm text-muted-foreground mt-2">
          Showing {filteredTickets.length} of {totalTickets} tickets
        </div>
      </div>

      {filteredTickets.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <div className="text-6xl mb-4">🎫</div>
          <h3 className="text-xl font-semibold text-foreground mb-2">No Tickets Yet</h3>
          <p className="text-muted-foreground mb-4">
            Email notification tickets will appear here when alarms are triggered and emails are sent.
          </p>
          <div className="text-sm text-muted-foreground">
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
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Timestamp</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Site</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Severity</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Recipients</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map(ticket => {
                  const recentlyResolved = isRecentlyResolved(ticket);
                  return (
                    <tr key={ticket.id} className={`border-b border-border hover:bg-accent ${recentlyResolved ? 'bg-green-500/5 border-l-4 border-l-green-500' : ''}`}>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {ticket.emailSentAt.toLocaleString()}
                        {ticket.resolvedAt && (
                          <div className="text-green-600 text-xs mt-1">
                            Resolved: {new Date(ticket.resolvedAt).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm text-foreground font-medium">{ticket.siteName}</div>
                          <div className="text-xs text-muted-foreground">{ticket.siteId}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs border ${getSeverityColor(ticket.severity)}`}>
                          {ticket.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="max-w-xs">
                          {ticket.recipients.length <= 3 ? (
                            <div className="flex flex-wrap gap-1">
                              {ticket.recipients.map((recipient, idx) => (
                                <span key={`${ticket.id}-${idx}`} className="text-sm text-muted-foreground">
                                  {recipient}{idx < ticket.recipients.length - 1 ? ', ' : ''}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex flex-wrap gap-1">
                                {ticket.recipients.slice(0, 2).map((recipient, idx) => (
                                  <span key={`${ticket.id}-${idx}`} className="text-sm text-muted-foreground">
                                    {recipient}{idx < 1 ? ', ' : ''}
                                  </span>
                                ))}
                                <span className="text-sm text-muted-foreground">
                                  , +{ticket.recipients.length - 2} more
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Total: {ticket.recipients.length} recipients
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold border ${getStatusColor(ticket.status)}`}>
                            {ticket.status}
                          </span>
                          {recentlyResolved && (
                            <span className="px-2 py-1 rounded text-xs bg-green-600 text-white font-semibold animate-pulse">
                              ✓ RECENTLY RESOLVED
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resolve Dialog */}
      {showResolveDialog && selectedTicket && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-4">Resolve Ticket</h3>

            <div className="mb-4">
              <label className="block text-sm text-muted-foreground mb-2">Notes (Optional)</label>
              <textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                className="w-full bg-background border border-input rounded px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none"
                rows={3}
                placeholder="Add resolution notes..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowResolveDialog(false)}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResolveTicket}
                className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors"
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
