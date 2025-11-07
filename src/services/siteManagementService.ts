const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface Site {
  id: string;
  siteId: string;
  siteName: string;
  state: string;
  city: string;
  transmission: 'Microwave' | 'VSAT' | 'Fiber';
  status: 'On Air' | 'Off Air' | 'Maintenance' | 'Planned';
  supervisor?: string;
  region?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  alarms: Array<{
    type: string;
    message: string;
    timestamp: Date;
    resolved: boolean;
  }>;
  lastSeen: string;
  uptime: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSiteRequest {
  siteId: string;
  siteName: string;
  state: string;
  city: string;
  transmission: 'Microwave' | 'VSAT' | 'Fiber';
  status: 'On Air' | 'Off Air' | 'Maintenance' | 'Planned';
  supervisor?: string;
}

export interface UpdateSiteRequest {
  siteId?: string;
  siteName?: string;
  state?: string;
  city?: string;
  transmission?: 'Microwave' | 'VSAT' | 'Fiber';
  status?: 'On Air' | 'Off Air' | 'Maintenance' | 'Planned';
  supervisor?: string;
}

class SiteManagementService {
  private getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async getAllSites(params?: {
    state?: string;
    city?: string;
    transmission?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<Site[]> {
    try {
      const queryParams = new URLSearchParams();

      if (params?.state && params.state !== 'all') queryParams.append('state', params.state);
      if (params?.city && params.city !== 'all') queryParams.append('city', params.city);
      if (params?.transmission && params.transmission !== 'all') queryParams.append('transmission', params.transmission);
      if (params?.status && params.status !== 'all') queryParams.append('status', params.status);
      if (params?.search) queryParams.append('search', params.search);
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());

      const url = `${API_BASE_URL}/sites${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sites');
      }

      const data = await response.json();
      return data.sites;
    } catch (error) {
      console.error('Error fetching sites:', error);
      throw error;
    }
  }

  async createSite(siteData: CreateSiteRequest): Promise<Site> {
    try {
      const response = await fetch(`${API_BASE_URL}/sites`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(siteData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create site');
      }

      const data = await response.json();
      return data.site;
    } catch (error) {
      console.error('Error creating site:', error);
      throw error;
    }
  }

  async updateSite(id: string, siteData: UpdateSiteRequest): Promise<Site> {
    try {
      const response = await fetch(`${API_BASE_URL}/sites/${id}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(siteData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update site');
      }

      const data = await response.json();
      return data.site;
    } catch (error) {
      console.error('Error updating site:', error);
      throw error;
    }
  }

  async deleteSite(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/sites/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete site');
      }
    } catch (error) {
      console.error('Error deleting site:', error);
      throw error;
    }
  }

  async getSiteStats(): Promise<{
    totalSites: number;
    onAirSites: number;
    offAirSites: number;
    microwaveSites: number;
    vsatSites: number;
    byState: Array<{ _id: string; count: number; onAir: number; }>;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/sites/stats/summary`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch site stats');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching site stats:', error);
      throw error;
    }
  }
}

export const siteManagementService = new SiteManagementService();
