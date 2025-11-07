const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface AlarmStats {
  totalAlarms: number;
  bySeverity: { [key: string]: number };
  byStatus: { [key: string]: number };
  recentAlarms: Array<{
    id: string;
    severity: string;
    siteName: string;
    alarmType: string;
    description: string;
    timestamp: Date;
  }>;
  topAlarmTypes: Array<{
    type: string;
    count: number;
  }>;
  bySite: Array<{
    siteName: string;
    count: number;
  }>;
}

export interface TicketStats {
  totalTickets: number;
  byStatus: { [key: string]: number };
  byPriority: { [key: string]: number };
  recentTickets: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    createdAt: Date;
  }>;
}

class ReportsService {
  private getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
  }

  async getAlarmStats(): Promise<AlarmStats> {
    const response = await fetch(`${API_BASE_URL}/reports/stats`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch alarm stats' }));
      throw new Error(error.message || 'Failed to fetch alarm stats');
    }

    const data = await response.json();

    // Transform the data to match our interface
    return {
      totalAlarms: data.totalAlarms,
      bySeverity: data.bySeverity,
      byStatus: data.byStatus,
      recentAlarms: data.recentAlarms.map((alarm: any) => ({
        ...alarm,
        timestamp: new Date(alarm.timestamp)
      })),
      topAlarmTypes: data.topAlarmTypes,
      bySite: data.bySite
    };
  }

  async getTicketStats(): Promise<TicketStats> {
    const response = await fetch(`${API_BASE_URL}/reports/tickets`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch ticket stats' }));
      throw new Error(error.message || 'Failed to fetch ticket stats');
    }

    const data = await response.json();

    return {
      totalTickets: data.totalTickets,
      byStatus: data.byStatus,
      byPriority: data.byPriority,
      recentTickets: data.recentTickets.map((ticket: any) => ({
        ...ticket,
        createdAt: new Date(ticket.createdAt)
      }))
    };
  }

  async getHistoricalReports(queryParams?: string): Promise<HistoricalReportsResponse> {
    try {
      const url = `${API_BASE_URL}/reports/historical${queryParams ? `?${queryParams}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch historical reports');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching historical reports:', error);
      throw error;
    }
  }

  async exportHistoricalReports(
    dateRange: { start: Date; end: Date },
    filters: any,
    format: 'pdf' | 'excel'
  ): Promise<void> {
    try {
      const queryParams = new URLSearchParams({
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString(),
        format,
      });

      // Add filter parameters
      if (filters.regions?.length > 0) queryParams.append('regions', filters.regions.join(','));
      if (filters.rootCauses?.length > 0) queryParams.append('rootCauses', filters.rootCauses.join(','));
      if (filters.alarmTypes?.length > 0) queryParams.append('alarmTypes', filters.alarmTypes.join(','));
      if (filters.statuses?.length > 0) queryParams.append('statuses', filters.statuses.join(','));

      const response = await fetch(`${API_BASE_URL}/reports/historical/export?${queryParams.toString()}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to export reports');
      }

      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `historical-reports-${format}-${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting historical reports:', error);
      throw error;
    }
  }
}

export interface HistoricalReportFilters {
  startDate?: string;
  endDate?: string;
  regions?: string;
  rootCauses?: string;
  alarmTypes?: string;
  statuses?: string;
  page?: number;
  limit?: number;
}

export interface HistoricalReport {
  id: string;
  siteNo: string;
  siteCode: string;
  region: string;
  alarmType: string;
  occurrenceTime: string;
  resolutionTime?: string;
  expectedResolutionHours?: number;
  status: string;
  rootCause?: string;
  supervisor?: string;
  createdBy?: { name: string; username: string };
  updatedBy?: { name: string; username: string };
}

export interface HistoricalStats {
  totalReports: number;
  resolvedCount: number;
  openCount: number;
  inProgressCount: number;
  mttr: number;
  slaCompliance: number;
  withinSLA: number;
  totalResolved: number;
}

export interface HistoricalReportsResponse {
  reports: HistoricalReport[];
  carryOver: HistoricalReport[];
  stats: HistoricalStats;
  pagination: {
    current: number;
    total: number;
    count: number;
    totalReports: number;
  };
}

export const reportsService = new ReportsService();
