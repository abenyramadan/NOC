import { apiRequest } from './api';

export interface NotificationRule {
  _id: string;
  name: string;
  severity: string[];
  recipients: string[];
  methods: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface NotificationSettings {
  email: {
    enabled: boolean;
    smtpHost: string;
    smtpPort: number;
    fromEmail: string;
    smtpUser: string;
  };
  sms: {
    enabled: boolean;
  };
}

interface CreateNotificationRuleDto {
  name: string;
  severity: string[];
  recipients: string[];
  methods: string[];
  enabled: boolean;
  createdBy: string;
}

interface UpdateNotificationRuleDto extends Partial<CreateNotificationRuleDto> {}

interface UpdateNotificationSettingsDto {
  email: Partial<NotificationSettings['email']>;
  sms: Partial<NotificationSettings['sms']>;
}

// Notification Rules API
export const getNotificationRules = async (): Promise<NotificationRule[]> => {
  return apiRequest<NotificationRule[]>({
    method: 'GET',
    url: '/notification-rules'
  });
};

export const createNotificationRule = async (rule: CreateNotificationRuleDto): Promise<NotificationRule> => {
  return apiRequest<NotificationRule>({
    method: 'POST',
    url: '/notification-rules',
    data: rule
  });
};

export const updateNotificationRule = async (
  id: string, 
  updates: UpdateNotificationRuleDto
): Promise<NotificationRule> => {
  return apiRequest<NotificationRule>({
    method: 'PUT',
    url: `/notification-rules/${id}`,
    data: updates
  });
};

export const deleteNotificationRule = async (id: string): Promise<void> => {
  await apiRequest<void>({
    method: 'DELETE',
    url: `/notification-rules/${id}`
  });
};

export const toggleNotificationRule = async (
  id: string, 
  enabled: boolean
): Promise<NotificationRule> => {
  return apiRequest<NotificationRule>({
    method: 'PATCH',
    url: `/notification-rules/${id}/toggle`,
    data: { enabled }
  });
};

export const getNotificationSettings = async (): Promise<NotificationSettings> => {
  try {
    const data = await apiRequest<NotificationSettings>({
      method: 'GET',
      url: '/notification-settings'
    });
    
    // Ensure all required fields have default values
    return {
      email: {
        enabled: data.email?.enabled ?? false,
        smtpHost: data.email?.smtpHost ?? '',
        smtpPort: data.email?.smtpPort ? Number(data.email.smtpPort) : 587,
        fromEmail: data.email?.fromEmail ?? '',
        smtpUser: data.email?.smtpUser ?? ''
      },
      sms: {
        enabled: data.sms?.enabled ?? false
      }
    };
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    // Return default settings on error
    return {
      email: {
        enabled: false,
        smtpHost: '',
        smtpPort: 587,
        fromEmail: '',
        smtpUser: ''
      },
      sms: {
        enabled: false
      }
    };
  }
};

export const updateNotificationSettings = async (
  settings: UpdateNotificationSettingsDto
): Promise<NotificationSettings> => {
  return apiRequest<NotificationSettings>({
    method: 'PUT',
    url: '/notification-settings',
    data: settings
  });
};
