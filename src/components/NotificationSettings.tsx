import React, { useState, useEffect } from 'react';
import { 
  NotificationRule as NotificationRuleType, 
  NotificationSettings as NotificationSettingsType,
  getNotificationRules, 
  createNotificationRule, 
  updateNotificationRule, 
  deleteNotificationRule, 
  toggleNotificationRule,
  getNotificationSettings,
  updateNotificationSettings
} from '../services/notificationService';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface NotificationRuleForm extends Omit<NotificationRuleType, '_id' | 'createdAt' | 'updatedAt' | 'createdBy'> {
  id?: string;
}

const defaultRule: NotificationRuleForm = {
  name: '',
  severity: [],
  recipients: [],
  methods: ['email'],
  enabled: true
};

export const NotificationSettings: React.FC = () => {
  const [rules, setRules] = useState<NotificationRuleType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<NotificationSettingsType>({
    email: { enabled: false, smtpHost: '', smtpPort: 587, fromEmail: '', smtpUser: '' },
    sms: { enabled: false }
  });
  const [isEditing, setIsEditing] = useState(false);
  const [currentRule, setCurrentRule] = useState<Partial<NotificationRuleType> | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Load notification rules and settings
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [rulesData, settingsData] = await Promise.all([
          getNotificationRules(),
          getNotificationSettings()
        ]);
        setRules(rulesData);
        setSettings(settingsData);
      } catch (error) {
        console.error('Error loading notification data:', error);
        toast.error('Failed to load notification settings');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleToggleRule = async (id: string, enabled: boolean) => {
    try {
      await toggleNotificationRule(id, !enabled);
      setRules(rules.map(rule => 
        rule._id === id ? { ...rule, enabled: !enabled } : rule
      ));
      toast.success('Notification rule updated');
    } catch (error) {
      console.error('Error toggling rule:', error);
      toast.error('Failed to update notification rule');
    }
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRule) return;

    try {
      if (isEditing && currentRule._id) {
        // Update existing rule
        const updatedRule = await updateNotificationRule(currentRule._id, currentRule);
        setRules(rules.map(rule => 
          rule._id === currentRule._id ? updatedRule : rule
        ));
        toast.success('Notification rule updated');
      } else {
        // Create new rule
        const newRule = await createNotificationRule({
          name: currentRule.name || '',
          severity: currentRule.severity || [],
          recipients: currentRule.recipients || [],
          methods: currentRule.methods || ['email'],
          enabled: currentRule.enabled ?? true,
          createdBy: (currentRule as any).createdBy || 'current-user-id'
        });
        setRules([newRule, ...rules]);
        toast.success('Notification rule created');
      }
      setShowForm(false);
      setCurrentRule(null);
    } catch (error) {
      console.error('Error saving rule:', error);
      toast.error(`Failed to ${isEditing ? 'update' : 'create'} notification rule`);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this rule?')) {
      try {
        await deleteNotificationRule(id);
        setRules(rules.filter(rule => rule._id !== id));
        toast.success('Notification rule deleted');
      } catch (error) {
        console.error('Error deleting rule:', error);
        toast.error('Failed to delete notification rule');
      }
    }
  };

  const handleEditRule = (rule: NotificationRuleType) => {
    setCurrentRule({
      _id: rule._id,
      name: rule.name,
      severity: [...rule.severity],
      recipients: [...rule.recipients],
      methods: [...rule.methods],
      enabled: rule.enabled,
      createdBy: rule.createdBy
    });
    setIsEditing(true);
    setShowForm(true);
  };

  const handleAddRule = () => {
    setCurrentRule({
      name: '',
      severity: [],
      recipients: [],
      methods: ['email'],
      enabled: true,
      createdBy: 'current-user-id' // This should be set to the current user's ID
    });
    setIsEditing(false);
    setShowForm(true);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Convert string port to number if needed
      const settingsToUpdate = {
        ...settings,
        email: {
          ...settings.email,
          smtpPort: typeof settings.email.smtpPort === 'string' 
            ? parseInt(settings.email.smtpPort, 10) 
            : settings.email.smtpPort
        }
      };
      
      const updatedSettings = await updateNotificationSettings(settingsToUpdate);
      setSettings(updatedSettings);
      toast.success('Notification settings updated');
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('Failed to update notification settings');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Notification Settings</h2>
        <p className="text-gray-400 mt-1">Configure email and SMS alerts for alarm events</p>
      </div>

      <form onSubmit={handleSaveSettings}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-[#1e2230] rounded-lg border border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Email Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">SMTP Server</label>
                <input 
                  type="text" 
                  value={settings.email.smtpHost || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    email: { ...settings.email, smtpHost: e.target.value }
                  })}
                  className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-white" 
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Port</label>
                  <input 
                    type="number" 
                    value={typeof settings.email.smtpPort === 'number' ? settings.email.smtpPort : parseInt(String(settings.email.smtpPort || 0), 10)}
                    onChange={(e) => setSettings({
                      ...settings,
                      email: { ...settings.email, smtpPort: parseInt(e.target.value, 10) || 0 }
                    })}
                    className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-white"
                    placeholder="587"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Username</label>
                  <input 
                    type="text" 
                    value={settings.email.smtpUser || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      email: { ...settings.email, smtpUser: e.target.value }
                    })}
                    className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-white"
                    placeholder="username"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">From Address</label>
                <input 
                  type="email" 
                  value={settings.email.fromEmail || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    email: { ...settings.email, fromEmail: e.target.value }
                  })}
                  className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-white"
                  placeholder="noreply@example.com"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="enable-email"
                  checked={settings.email.enabled}
                  onChange={(e) => setSettings({
                    ...settings,
                    email: { ...settings.email, enabled: e.target.checked }
                  })}
                  className="w-4 h-4"
                />
                <label htmlFor="enable-email" className="text-sm text-gray-300">
                  Enable email notifications
                </label>
              </div>
            </div>
          </div>

          <div className="bg-[#1e2230] rounded-lg border border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">SMS Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">SMS Gateway</label>
                <input 
                  type="text" 
                  value="api.twilio.com" 
                  className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-400" 
                  readOnly 
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">API Key</label>
                <input 
                  type="password" 
                  value="••••••••••••••••" 
                  className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-gray-400" 
                  readOnly 
                  disabled
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="enable-sms"
                  checked={settings.sms.enabled}
                  onChange={(e) => setSettings({
                    ...settings,
                    sms: { ...settings.sms, enabled: e.target.checked }
                  })}
                  className="w-4 h-4"
                  disabled
                />
                <label htmlFor="enable-sms" className="text-sm text-gray-400">
                  Enable SMS notifications (coming soon)
                </label>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end mb-6">
          <button 
            type="submit" 
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded transition-colors"
          >
            Save Settings
          </button>
        </div>
      </form>

      <div className="bg-[#1e2230] rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Notification Rules</h3>
          <button 
            type="button"
            onClick={handleAddRule}
            className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded transition-colors"
          >
            + Add Rule
          </button>
        </div>

        {showForm && currentRule && (
          <div className="p-6 border-b border-gray-800 bg-[#1a1e2a]">
            <h4 className="text-white font-medium mb-4">
              {isEditing ? 'Edit Rule' : 'Add New Rule'}
            </h4>
            
            <form onSubmit={handleSaveRule} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Rule Name</label>
                <input
                  type="text"
                  value={currentRule.name}
                  onChange={(e) => setCurrentRule({ ...currentRule, name: e.target.value })}
                  className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-white"
                  placeholder="e.g., Critical Alerts - On-Call Team"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Severity</label>
                <div className="flex flex-wrap gap-2">
                  {['critical', 'major', 'minor', 'warning'].map((sev) => (
                    <label key={sev} className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        checked={currentRule.severity.includes(sev)}
                        onChange={(e) => {
                          const newSeverity = e.target.checked
                            ? [...currentRule.severity, sev]
                            : currentRule.severity.filter(s => s !== sev);
                          setCurrentRule({ ...currentRule, severity: newSeverity });
                        }}
                        className="rounded border-gray-600 text-cyan-600 focus:ring-cyan-600"
                      />
                      <span className="capitalize">{sev}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Notification Methods</label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={currentRule.methods.includes('email')}
                      onChange={(e) => {
                        const newMethods = e.target.checked
                          ? [...currentRule.methods, 'email']
                          : currentRule.methods.filter(m => m !== 'email');
                        setCurrentRule({ ...currentRule, methods: newMethods });
                      }}
                      className="rounded border-gray-600 text-cyan-600 focus:ring-cyan-600"
                    />
                    <span>Email</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-400">
                    <input
                      type="checkbox"
                      checked={currentRule.methods.includes('sms')}
                      onChange={(e) => {
                        const newMethods = e.target.checked
                          ? [...currentRule.methods, 'sms']
                          : currentRule.methods.filter(m => m !== 'sms');
                        setCurrentRule({ ...currentRule, methods: newMethods });
                      }}
                      className="rounded border-gray-400 text-gray-400 focus:ring-gray-400"
                      disabled
                    />
                    <span>SMS (coming soon)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Recipients (comma-separated emails)</label>
                <input
                  type="text"
                  value={currentRule.recipients.join(', ')}
                  onChange={(e) => {
                    const emails = e.target.value
                      .split(',')
                      .map(email => email.trim())
                      .filter(Boolean);
                    setCurrentRule({ ...currentRule, recipients: emails });
                  }}
                  className="w-full bg-[#151820] border border-gray-700 rounded px-3 py-2 text-sm text-white"
                  placeholder="user1@example.com, user2@example.com"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setCurrentRule(null);
                  }}
                  className="px-3 py-1 text-sm text-gray-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded transition-colors"
                >
                  {isEditing ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="p-6 space-y-4">
          {rules.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No notification rules found. Click "Add Rule" to create one.
            </div>
          ) : (
            rules.map((rule) => (
              <div key={rule._id} className="bg-[#151820] rounded-lg p-4 border border-gray-700">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-white font-semibold">{rule.name}</h4>
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">
                        {rule.enabled ? 'Active' : 'Inactive'}
                      </span>
                      {rule.methods.includes('email') && (
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
                          EMAIL
                        </span>
                      )}
                      {rule.methods.includes('sms') && (
                        <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                          SMS
                        </span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {rule.severity.map(s => (
                        <span 
                          key={s} 
                          className={`px-2 py-0.5 text-xs rounded capitalize ${
                            s === 'critical' ? 'bg-red-500/20 text-red-400' :
                            s === 'major' ? 'bg-orange-500/20 text-orange-400' :
                            s === 'minor' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    
                    <p className="text-sm text-gray-400">
                      <span className="text-gray-500">To:</span> {rule.recipients.join(', ')}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditRule(rule)}
                      className="p-1 text-gray-400 hover:text-white"
                      title="Edit rule"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    
                    <button
                      onClick={() => handleDeleteRule(rule._id)}
                      className="p-1 text-red-400 hover:text-red-300"
                      title="Delete rule"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    
                    <label className="relative inline-flex items-center cursor-pointer ml-2">
                      <input 
                        type="checkbox" 
                        checked={rule.enabled}
                        onChange={() => handleToggleRule(rule._id, rule.enabled)}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
