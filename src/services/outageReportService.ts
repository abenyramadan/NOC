const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface OutageReport {
  id: string;
  siteNo: string;
  siteCode: string;
  region: 'Bahr gha zal' | 'Equatoria' | 'Upper Nile';
  alarmType: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'WARNING' | 'INFO';
  occurrenceTime: Date;
  supervisor: string;
  rootCause: 'Generator' | 'Transmission' | 'Radio' | 'Environment' | 'Others';
  subrootCause?: string;
  username: string;
  resolutionTime?: Date;
  expectedRestorationTime?: Date;
  mandatoryRestorationTime: Date; // SLA deadline as actual date/time - mandatory
  status: 'In Progress' | 'Resolved';
  createdBy?: {
    name: string;
    username: string;
  };
  updatedBy?: {
    name: string;
    username: string;
  };
  createdAt: Date;
  updatedAt: Date;
  reportHour: Date;
  isEmailSent: boolean;
  emailSentAt?: Date;
  slaStatus?: 'within' | 'out' | null;
  expectedResolutionHours?: number; // Hours for SLA calculation
}

export interface OutageReportFilters {
  page?: number;
  limit?: number;
  status?: string;
  region?: string;
  alarmType?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface OutageReportPagination {
  total: number;
  page: number;
  pages: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface OutageReportsResponse {
  reports: OutageReport[];
  pagination: OutageReportPagination;
}

export interface OutageReportStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  byRegion: Array<{ region: string; count: number }>;
  byAlarmType: Array<{ alarmType: string; count: number }>;
}

export interface DailyReportSummary {
  totalReports: number;
  totalOpen: number;
  totalInProgress: number;
  totalResolved: number;
  mttr: number;
  outOfSLA?: number;
}

export interface AlarmsByRootCause {
  rootCause: string;
  count: number;
  alarms: OutageReport[];
}

export interface TicketsPerRegion {
  region: string;
  _id?: string; // For backward compatibility with aggregation results
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  withinSLATickets?: number;
  within_sla?: number; // For backward compatibility
  outOfSLATickets?: number;
  out_of_sla?: number; // For backward compatibility
  criticalAlarms: number;
  majorAlarms: number;
  minorAlarms: number;
}

export interface DailyReportsResponse {
  reportDate: Date;
  summary: DailyReportSummary;
  alarmsByRootCause: AlarmsByRootCause[];
  ticketsPerRegion: TicketsPerRegion[];
  allReports: OutageReport[];
  ongoingOutages?: OutageReport[];
  resolvedOutages?: OutageReport[];
}

class OutageReportService {
  private getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
  }

  async getOutageReports(filters: OutageReportFilters = {}): Promise<OutageReportsResponse> {
    const queryParams = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const response = await fetch(`${API_BASE_URL}/api/outage-reports?${queryParams}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch outage reports' }));
      throw new Error(error.message || 'Failed to fetch outage reports');
    }

    const data = await response.json();

    // Transform and validate the data
    const reports = (data.reports || []).map((report: any) => {
      if (!report || (!report.id && !report._id)) {
        console.warn('Invalid report data:', report);
        return null;
      }

      return {
        id: report._id || report.id, // Handle both _id and id fields
        ...report,
        occurrenceTime: report.occurrenceTime ? new Date(report.occurrenceTime) : new Date(),
        resolutionTime: report.resolutionTime ? new Date(report.resolutionTime) : undefined,
        expectedResolutionHours: report.expectedResolutionHours,
        createdAt: new Date(report.createdAt),
        updatedAt: new Date(report.updatedAt),
        reportHour: new Date(report.reportHour),
        emailSentAt: report.emailSentAt ? new Date(report.emailSentAt) : undefined
      };
    }).filter(Boolean); // Remove null entries

    return {
      reports,
      pagination: data.pagination || { total: 0, page: 1, pages: 1, limit: 50, hasNext: false, hasPrev: false }
    };
  }

  async getOutageReport(id: string): Promise<OutageReport> {
    const response = await fetch(`${API_BASE_URL}/api/outage-reports/${id}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch outage report' }));
      throw new Error(error.message || 'Failed to fetch outage report');
    }

    const data = await response.json();

    return {
      ...data,
      occurrenceTime: new Date(data.occurrenceTime),
      resolutionTime: data.resolutionTime ? new Date(data.resolutionTime) : undefined,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      reportHour: new Date(data.reportHour),
      emailSentAt: data.emailSentAt ? new Date(data.emailSentAt) : undefined
    };
  }

  async getOutageReportsForHour(hourDate: Date): Promise<OutageReport[]> {
    const response = await fetch(`${API_BASE_URL}/api/outage-reports/hourly/${hourDate.toISOString()}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch hourly outage reports' }));
      throw new Error(error.message || 'Failed to fetch hourly outage reports');
    }

    const data = await response.json();

    return data.map((report: any) => ({
      ...report,
      occurrenceTime: new Date(report.occurrenceTime),
      resolutionTime: report.resolutionTime ? new Date(report.resolutionTime) : undefined,
      expectedResolutionHours: report.expectedResolutionHours,
      createdAt: new Date(report.createdAt),
      updatedAt: new Date(report.updatedAt),
      reportHour: new Date(report.reportHour),
      emailSentAt: report.emailSentAt ? new Date(report.emailSentAt) : undefined
    }));
  }

  async createOutageReport(reportData: Partial<OutageReport>): Promise<OutageReport> {
    const response = await fetch(`${API_BASE_URL}/api/outage-reports`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(reportData),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create outage report' }));
      throw new Error(error.message || 'Failed to create outage report');
    }

    const data = await response.json();

    return {
      ...data,
      occurrenceTime: new Date(data.occurrenceTime),
      resolutionTime: data.resolutionTime ? new Date(data.resolutionTime) : undefined,
      mandatoryRestorationTime: data.mandatoryRestorationTime ? new Date(data.mandatoryRestorationTime) : undefined,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      reportHour: new Date(data.reportHour),
      emailSentAt: data.emailSentAt ? new Date(data.emailSentAt) : undefined
    };
  }

  async updateOutageReport(id: string, updateData: Partial<OutageReport>): Promise<OutageReport> {
    const response = await fetch(`${API_BASE_URL}/api/outage-reports/${id}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to update outage report' }));
      throw new Error(error.message || 'Failed to update outage report');
    }

    const data = await response.json();

    return {
      ...data,
      occurrenceTime: new Date(data.occurrenceTime),
      resolutionTime: data.resolutionTime ? new Date(data.resolutionTime) : undefined,
      mandatoryRestorationTime: data.mandatoryRestorationTime ? new Date(data.mandatoryRestorationTime) : undefined,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      reportHour: new Date(data.reportHour),
      emailSentAt: data.emailSentAt ? new Date(data.emailSentAt) : undefined
    };
  }

  async deleteOutageReport(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/outage-reports/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete outage report' }));
      throw new Error(error.message || 'Failed to delete outage report');
    }
  }

  async getOutageReportStats(): Promise<OutageReportStats> {
    const response = await fetch(`${API_BASE_URL}/api/outage-reports/stats/summary`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch outage report stats' }));
      throw new Error(error.message || 'Failed to fetch outage report stats');
    }

    return await response.json();
  }

  async getDailyReports(reportDate?: string): Promise<DailyReportsResponse> {
    const queryParams = new URLSearchParams();
    if (reportDate) {
      queryParams.append('reportDate', reportDate);
    }

    const response = await fetch(`${API_BASE_URL}/api/outage-reports/daily?${queryParams}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch daily reports' }));
      throw new Error(error.message || 'Failed to fetch daily reports');
    }

    const data = await response.json();

    // Transform the data
    return {
      reportDate: new Date(data.reportDate),
      summary: data.summary,
      alarmsByRootCause: data.alarmsByRootCause,
      ticketsPerRegion: data.ticketsPerRegion.map((region: any) => ({
        ...region,
        withinSLA: region.withinSLA ?? region.within_sla ?? 0,
        outOfSLA: region.outOfSLA ?? region.out_of_sla ?? 0,
      })),
      allReports: data.allReports.map((report: any) => ({
        ...report,
        id: report.id || report._id,
        occurrenceTime: new Date(report.occurrenceTime),
        resolutionTime: report.resolutionTime ? new Date(report.resolutionTime) : undefined,
        expectedRestorationTime: report.expectedRestorationTime ? new Date(report.expectedRestorationTime) : undefined,
        mandatoryRestorationTime: report.mandatoryRestorationTime ? new Date(report.mandatoryRestorationTime) : undefined
      }))
    };
  }

  async getCarryOverReports(selectedDate: string): Promise<OutageReportsResponse> {
    const queryParams = new URLSearchParams();
    queryParams.append('selectedDate', selectedDate);

    const response = await fetch(`${API_BASE_URL}/api/outage-reports/carry-over?${queryParams}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch carry-over reports' }));
      throw new Error(error.message || 'Failed to fetch carry-over reports');
    }

    const data = await response.json();

    // Transform and validate the data
    const reports = (data.reports || []).map((report: any) => {
      if (!report || (!report.id && !report._id)) {
        console.warn('Invalid carry-over report data:', report);
        return null;
      }

      return {
        id: report._id || report.id,
        ...report,
        occurrenceTime: report.occurrenceTime ? new Date(report.occurrenceTime) : new Date(),
        resolutionTime: report.resolutionTime ? new Date(report.resolutionTime) : undefined,
        expectedRestorationTime: report.expectedRestorationTime ? new Date(report.expectedRestorationTime) : undefined,
        mandatoryRestorationTime: report.mandatoryRestorationTime ? new Date(report.mandatoryRestorationTime) : undefined,
        expectedResolutionHours: report.expectedResolutionHours,
        createdAt: new Date(report.createdAt),
        updatedAt: new Date(report.updatedAt),
        reportHour: new Date(report.reportHour),
        emailSentAt: report.emailSentAt ? new Date(report.emailSentAt) : undefined
      };
    }).filter(Boolean);

    return {
      reports,
      pagination: data.pagination || { total: 0, page: 1, pages: 1, limit: 50, hasNext: false, hasPrev: false }
    };
  }

  // New: SLA% and MTTR trends for last N days ending at endDate (YYYY-MM-DD)
  async getTrends(days: 7 | 30 = 7, endDate?: string): Promise<{ range: number; endDate: string; points: Array<{ date: string; sla: number; mttr: number }>; }> {
    const query = new URLSearchParams();
    query.set('days', String(days));
    if (endDate) query.set('endDate', endDate);
    const response = await fetch(`${API_BASE_URL}/api/outage-reports/metrics/trends?${query.toString()}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch trends' }));
      throw new Error(error.message || 'Failed to fetch trends');
    }
    return response.json();
  }

  // New: Monthly aggregates by region and root causes for YYYY-MM
  async getMonthlyMetrics(month: string): Promise<{ month: string; summary: { totalReports: number; mttr?: number }; ticketsPerRegion: Array<{ region: string; totalTickets: number; openTickets?: number; inProgressTickets?: number; resolvedTickets?: number; withinSLATickets?: number }>; alarmsByRootCause: Array<{ rootCause: string; count: number }>; regionDayMatrix?: { days: number; regions: string[]; values: Record<string, number[]> } }> {
    const query = new URLSearchParams();
    query.set('month', month);
    const response = await fetch(`${API_BASE_URL}/api/outage-reports/metrics/monthly?${query.toString()}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch monthly metrics' }));
      throw new Error(error.message || 'Failed to fetch monthly metrics');
    }
    return response.json();
  }
}

export const outageReportService = new OutageReportService();
