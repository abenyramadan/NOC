import axios from 'axios';

// Minimal request config to keep typing simple and flexible
export type ApiRequestConfig = {
  method?: 'get' | 'post' | 'put' | 'delete' | 'patch';
  url?: string;
  data?: any;
  headers?: Record<string, any>;
  withCredentials?: boolean;
};

// Resolve baseURL safely for browser
const resolveBaseURL = (): string => {
  // Try to get from environment variable (CRA style, guarded for browser)
  try {
    if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) {
      return process.env.REACT_APP_API_URL;
    }
  } catch (e) {
    // Silently fail if process is not available
  }

  // Fallback: infer from current host (assumes backend on 3000 during dev)
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:3000/api`;
  }

  // Final fallback
  return 'http://localhost:3000/api';
};

// Create an axios instance with default config
const api = axios.create({
  baseURL: resolveBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important for sending cookies with requests
});

// Request interceptor to add auth token to requests
api.interceptors.request.use(
  (config: any) => {
    // Support both keys, prefer authToken used by AuthContext
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (token) {
      const headers = config.headers || {};
      headers.Authorization = `Bearer ${token}`;
      config.headers = headers;
    }
    return config;
  },
  (error: any) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle common errors
api.interceptors.response.use(
  (response: any) => response,
  (error: any) => {
    // Handle common errors (e.g., 401 Unauthorized)
    if (error.response?.status === 401) {
      // Only redirect to login if we're not already there and token exists
      const currentPath = window.location.pathname;
      const hasToken = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      if (hasToken && currentPath !== '/login') {
        // Token is invalid, remove it and redirect
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        console.warn('Session expired, redirecting to login');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Helper function to type the response
export const apiRequest = async <T>(
  config: any
): Promise<T> => {
  try {
    if (!config.url) throw new Error('apiRequest: url is required');
    if (!config.method) config.method = 'get';

    const response = await api.request({
      ...(config as any),
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers || {}),
      },
    } as any);
    return response.data as T;
  } catch (error) {
    const anyErr: any = error;
    const errorMessage = anyErr?.response?.data?.message || anyErr?.message || 'An error occurred';
    // Re-throw a simple Error to keep typing sane
    throw new Error(errorMessage);
  }
};

export default api;
