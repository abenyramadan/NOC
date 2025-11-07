import { apiRequest } from './api';

export interface AuditLog {
  _id: string;
  user: string;
  action: string;
  target: string;
  details: string;
  status: 'success' | 'failed';
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogStats {
  summary: {
    totalLogs: number;
    successLogs: number;
    failedLogs: number;
  };
  byAction: Array<{ _id: string; count: number }>;
  byUser: Array<{ _id: string; count: number }>;
}

export interface AuditLogFilters {
  user?: string;
  action?: string;
  target?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AuditLogResponse {
  auditLogs: AuditLog[];
  pagination: {
    current: number;
    total: number;
    count: number;
    totalLogs: number;
  };
}

// Audit Logs API
export const getAuditLogs = async (filters?: AuditLogFilters): Promise<AuditLogResponse> => {
  const params = new URLSearchParams();
  
  if (filters) {
    if (filters.user) params.append('user', filters.user);
    if (filters.action) params.append('action', filters.action);
    if (filters.target) params.append('target', filters.target);
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
  }

  return apiRequest<AuditLogResponse>({
    method: 'get',
    url: `/audit${params.toString() ? `?${params.toString()}` : ''}`
  });
};

export const getAuditStats = async (): Promise<AuditLogStats> => {
  return apiRequest<AuditLogStats>({
    method: 'get',
    url: '/audit/stats/summary'
  });
};

export const createAuditLog = async (logData: {
  user?: string;
  action: string;
  target: string;
  details: string;
  status?: 'success' | 'failed';
}): Promise<{ message: string; auditLog: AuditLog }> => {
  return apiRequest({
    method: 'post',
    url: '/audit',
    data: logData
  });
};
