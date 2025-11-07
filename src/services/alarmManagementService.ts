const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface Alarm {
  id: string;
  siteId: string;
  siteName: string;
  severity: 'critical' | 'major' | 'minor';
  alarmType: string;
  description: string;
  source: string;
  status: 'active' | 'acknowledged' | 'resolved';
  siteType: 'Microwave' | 'VSAT' | 'Fiber';
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAlarmRequest {
  siteId: string;
  siteName: string;
  severity: 'critical' | 'major' | 'minor';
  alarmType: string;
  description: string;
  source: string;
}

export interface UpdateAlarmRequest {
  status?: 'active' | 'acknowledged' | 'resolved';
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
}

class AlarmManagementService {
  private getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async getAllAlarms(params?: {
    severity?: string;
    status?: string;
    siteId?: string;
    siteName?: string;
    alarmType?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<Alarm[]> {
    try {
      const queryParams = new URLSearchParams();

      if (params?.severity && params.severity !== 'all') queryParams.append('severity', params.severity);
      if (params?.status && params.status !== 'all') queryParams.append('status', params.status);
      if (params?.siteId) queryParams.append('siteId', params.siteId);
      if (params?.siteName) queryParams.append('siteName', params.siteName);
      if (params?.alarmType && params.alarmType !== 'all') queryParams.append('alarmType', params.alarmType);
      if (params?.search) queryParams.append('search', params.search);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);

      const url = `${API_BASE_URL}/alarms${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch alarms');
      }

      const data = await response.json();
      return data.alarms;
    } catch (error) {
      console.error('Error fetching alarms:', error);
      throw error;
    }
  }

  async getAlarmById(id: string): Promise<Alarm> {
    try {
      const response = await fetch(`${API_BASE_URL}/alarms/${id}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch alarm');
      }

      const data = await response.json();
      return data.alarm;
    } catch (error) {
      console.error('Error fetching alarm:', error);
      throw error;
    }
  }

  async createAlarm(alarmData: CreateAlarmRequest): Promise<Alarm> {
    try {
      const response = await fetch(`${API_BASE_URL}/alarms`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(alarmData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create alarm');
      }

      const data = await response.json();
      return data.alarm;
    } catch (error) {
      console.error('Error creating alarm:', error);
      throw error;
    }
  }

  async updateAlarm(id: string, alarmData: UpdateAlarmRequest): Promise<Alarm> {
    try {
      const response = await fetch(`${API_BASE_URL}/alarms/${id}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(alarmData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update alarm');
      }

      const data = await response.json();
      return data.alarm;
    } catch (error) {
      console.error('Error updating alarm:', error);
      throw error;
    }
  }

  async deleteAlarm(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/alarms/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete alarm');
      }
    } catch (error) {
      console.error('Error deleting alarm:', error);
      throw error;
    }
  }

  async getAlarmStats(): Promise<{
    summary: {
      totalAlarms: number;
      activeAlarms: number;
      acknowledgedAlarms: number;
      resolvedAlarms: number;
      criticalAlarms: number;
      majorAlarms: number;
      minorAlarms: number;
    };
    bySite: Array<{
      _id: string;
      count: number;
      siteName: string;
    }>;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/alarms/stats/summary`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch alarm stats');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching alarm stats:', error);
      throw error;
    }
  }
}

export const alarmManagementService = new AlarmManagementService();
