import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, Plus, Mail, Users, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

interface EmailConfig {
  dailyReports: string[];
  hourlyReports: string[];
  immediateAlerts: string[];
}

interface EmailFormData {
  email: string;
  type: 'dailyReports' | 'hourlyReports' | 'immediateAlerts';
}

const EmailManagement: React.FC = () => {
  const { user } = useAuth();
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    dailyReports: [],
    hourlyReports: [],
    immediateAlerts: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState<EmailFormData>({
    email: '',
    type: 'dailyReports'
  });
  const [formError, setFormError] = useState<string>('');

  // Load email configuration
  useEffect(() => {
    fetchEmailConfig();
  }, []);

  const fetchEmailConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/email/config`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch email configuration');
      }
      
      const config = await response.json();
      setEmailConfig(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load email configuration');
      console.error('Error fetching email config:', err);
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddEmail = async () => {
    if (!formData.email.trim()) {
      setFormError('Email is required');
      return;
    }
    
    if (!validateEmail(formData.email)) {
      setFormError('Please enter a valid email address');
      return;
    }

    // Check for duplicates
    const currentEmails = emailConfig[formData.type];
    if (currentEmails.includes(formData.email.toLowerCase())) {
      setFormError('This email is already added to this list');
      return;
    }

    try {
      setSaving(true);
      setFormError('');
      setError(null);
      setSuccess(null);

      const updatedConfig = {
        ...emailConfig,
        [formData.type]: [...currentEmails, formData.email.toLowerCase()]
      };

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/email/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(updatedConfig)
      });

      if (!response.ok) {
        throw new Error('Failed to update email configuration');
      }

      setEmailConfig(updatedConfig);
      setFormData({ email: '', type: 'dailyReports' });
      setSuccess('Email added successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add email');
      console.error('Error adding email:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveEmail = async (type: keyof EmailConfig, emailToRemove: string) => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const updatedConfig = {
        ...emailConfig,
        [type]: emailConfig[type].filter(email => email !== emailToRemove)
      };

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/email/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(updatedConfig)
      });

      if (!response.ok) {
        throw new Error('Failed to update email configuration');
      }

      setEmailConfig(updatedConfig);
      setSuccess('Email removed successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove email');
      console.error('Error removing email:', err);
    } finally {
      setSaving(false);
    }
  };

  const getEmailIcon = (type: keyof EmailConfig) => {
    switch (type) {
      case 'dailyReports':
        return <Mail className="h-4 w-4" />;
      case 'hourlyReports':
        return <Clock className="h-4 w-4" />;
      case 'immediateAlerts':
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getEmailTitle = (type: keyof EmailConfig) => {
    switch (type) {
      case 'dailyReports':
        return 'Daily Report Emails';
      case 'hourlyReports':
        return 'Hourly Report Emails';
      case 'immediateAlerts':
        return 'Immediate Alert Emails';
    }
  };

  const getEmailDescription = (type: keyof EmailConfig) => {
    switch (type) {
      case 'dailyReports':
        return 'Recipients who receive daily network performance reports at 23:59';
      case 'hourlyReports':
        return 'Recipients who receive hourly outage reports';
      case 'immediateAlerts':
        return 'Recipients who receive immediate notifications when alarms are detected';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Email Management</h2>
          <p className="text-muted-foreground mt-1">Manage email recipients for different notification types</p>
        </div>
      </div>

      {error && (
        <Alert className="border-red-500/20 bg-red-500/10">
          <AlertDescription className="text-red-400">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500/20 bg-green-500/10">
          <CheckCircle className="h-4 w-4 text-green-400" />
          <AlertDescription className="text-green-400">{success}</AlertDescription>
        </Alert>
      )}

      {/* Add Email Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Email Recipient
          </CardTitle>
          <CardDescription>Add a new email address to one of the notification lists</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, email: e.target.value }));
                  setFormError('');
                }}
                placeholder="Enter email address"
                className={formError ? 'border-red-500' : ''}
              />
              {formError && <p className="text-red-400 text-sm mt-1">{formError}</p>}
            </div>
            <div>
              <Label htmlFor="type">Notification Type</Label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
                className="w-full px-3 py-2 bg-background border border-input rounded text-foreground"
              >
                <option value="dailyReports">Daily Reports</option>
                <option value="hourlyReports">Hourly Reports</option>
                <option value="immediateAlerts">Immediate Alerts</option>
              </select>
            </div>
          </div>
          <Button 
            onClick={handleAddEmail} 
            disabled={saving || !formData.email.trim()}
            className="w-full md:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            {saving ? 'Adding...' : 'Add Email'}
          </Button>
        </CardContent>
      </Card>

      {/* Email Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {(Object.keys(emailConfig) as Array<keyof EmailConfig>).map((type) => (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getEmailIcon(type)}
                {getEmailTitle(type)}
                <Badge variant="secondary" className="ml-auto">
                  {emailConfig[type].length}
                </Badge>
              </CardTitle>
              <CardDescription>{getEmailDescription(type)}</CardDescription>
            </CardHeader>
            <CardContent>
              {emailConfig[type].length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No email recipients configured</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {emailConfig[type].map((email) => (
                    <div
                      key={email}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded group"
                    >
                      <span className="text-sm text-foreground truncate flex-1">{email}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveEmail(type, email)}
                        disabled={saving}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary Information */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration Summary</CardTitle>
          <CardDescription>Current email notification configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded">
              <Mail className="h-8 w-8 mx-auto mb-2 text-blue-500" />
              <div className="text-2xl font-bold">{emailConfig.dailyReports.length}</div>
              <div className="text-sm text-muted-foreground">Daily Report Recipients</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded">
              <Clock className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <div className="text-2xl font-bold">{emailConfig.hourlyReports.length}</div>
              <div className="text-sm text-muted-foreground">Hourly Report Recipients</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500" />
              <div className="text-2xl font-bold">{emailConfig.immediateAlerts.length}</div>
              <div className="text-sm text-muted-foreground">Immediate Alert Recipients</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailManagement;
