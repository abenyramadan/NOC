import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trash2,
  Plus,
  Mail,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  Server,
  MailCheck,
  Settings,
  Save,
  Loader2,
  AlertCircle,
  TestTube2,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface EmailConfig {
  dailyReports: string[];
  hourlyReports: string[];
  immediateAlerts: string[];
  fromEmail?: string;
  smtpUser?: string;
  smtpPass?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
}

interface EmailFormData {
  email: string;
  type: "dailyReports" | "hourlyReports" | "immediateAlerts";
}

const EmailManagement: React.FC = (): JSX.Element => {
  const { toast } = useToast();
  const { user } = useAuth();

  // State management
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>("");
  const [smtpError, setSmtpError] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testingSmtp, setTestingSmtp] = useState<boolean>(false);

  // Email configuration state
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    dailyReports: [],
    hourlyReports: [],
    immediateAlerts: [],
    fromEmail: "",
    smtpUser: "",
    smtpPass: "",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpSecure: false,
  });

  // Form state
  const [formData, setFormData] = useState<EmailFormData>({
    email: "",
    type: "dailyReports",
  });

  // SMTP state
  const [smtpStatus, setSmtpStatus] = useState<{
    connected: boolean;
    message: string;
    lastChecked: Date | null;
  }>({
    connected: false,
    message: "Not tested",
    lastChecked: null,
  });

  const smtpStatusStorageKey = "smtpStatus";
  const getSmtpConfigKey = (cfg: {
    smtpHost: string;
    smtpPort: string;
    smtpUser: string;
    smtpSecure: boolean;
  }) => `${cfg.smtpHost}|${cfg.smtpPort}|${cfg.smtpUser}|${cfg.smtpSecure}`;

  const [smtpHost, setSmtpHost] = useState<string>("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState<string>("587");
  const [smtpUser, setSmtpUser] = useState<string>("");
  // Single source of truth for SMTP password
  const [smtpPass, setSmtpPass] = useState<string>("");
  const [smtpSecure, setSmtpSecure] = useState<boolean>(false);
  const [smtpSaving, setSmtpSaving] = useState<boolean>(false);
  
  // UI state
  const [activeTab, setActiveTab] = useState<string>("smtp");
  const [fromEmail, setFromEmail] = useState<string>("");
  const [fromEmailError, setFromEmailError] = useState<string>("");
  const [fromEmailSaving, setFromEmailSaving] = useState<boolean>(false);
  
  const Info = AlertCircle;
  
  // Load configuration on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/email/config`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
          }
        );
        
        if (!response.ok) {
          throw new Error("Failed to load email configuration");
        }

        const config = await response.json();
        setEmailConfig(config);
        setFromEmail(config.fromEmail || "");
        setSmtpUser(config.smtpUser || "");
        setSmtpPass(config.smtpPass || "");
        setSmtpHost(config.smtpHost || "smtp.gmail.com");
        setSmtpPort((config.smtpPort || 587).toString());
        setSmtpSecure(config.smtpSecure === true);

        // Load last known SMTP status for this config (do not auto-test on load)
        const cfgKey = getSmtpConfigKey({
          smtpHost: (config.smtpHost || "smtp.gmail.com").trim(),
          smtpPort: String(config.smtpPort || 587),
          smtpUser: (config.smtpUser || "").trim(),
          smtpSecure: config.smtpSecure === true,
        });

        const stored = localStorage.getItem(smtpStatusStorageKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            const connected = parsed?.status?.connected ?? parsed?.connected;
            const message = parsed?.status?.message ?? parsed?.message;
            const lastChecked = parsed?.status?.lastChecked ?? parsed?.lastChecked;

            if (parsed?.configKey === cfgKey && lastChecked) {
              setSmtpStatus({
                connected: !!connected,
                message: message || "Not tested",
                lastChecked: new Date(lastChecked),
              });
            } else {
              setSmtpStatus({ connected: false, message: "Not tested", lastChecked: null });
            }
          } catch {
            setSmtpStatus({ connected: false, message: "Not tested", lastChecked: null });
          }
        } else {
          setSmtpStatus({ connected: false, message: "Not tested", lastChecked: null });
        }
      } catch (err) {
        console.error("Failed to load email config:", err);
        setError("Failed to load email configuration. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  // Validate email address
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Save email configuration
  const saveEmailConfig = async (config: EmailConfig) => {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/email/config`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify(config),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to save configuration");
    }

    const updatedConfig = await response.json();
    setEmailConfig(updatedConfig);
    return updatedConfig;
  };

  // Handle email removal
  const handleRemoveEmail = async (type: keyof Pick<EmailConfig, 'dailyReports' | 'hourlyReports' | 'immediateAlerts'>, emailToRemove: string) => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const updatedConfig = {
        ...emailConfig,
        [type]: Array.isArray(emailConfig[type])
          ? (emailConfig[type] as string[]).filter((email) => email !== emailToRemove)
          : [],
      };

      await saveEmailConfig(updatedConfig);
      setSuccess("Email removed successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove email");
      console.error("Error removing email:", err);
    } finally {
      setSaving(false);
    }
  };

  // Handle email addition
  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim()) {
      setFormError("Email is required");
      return;
    }

    if (!validateEmail(formData.email)) {
      setFormError("Please enter a valid email address");
      return;
    }

    // Check for duplicates
    const currentEmails = Array.isArray(emailConfig[formData.type])
      ? (emailConfig[formData.type] as string[])
      : [];
    if (currentEmails.includes(formData.email.toLowerCase())) {
      setFormError("This email is already added to this list");
      return;
    }

    try {
      setSaving(true);
      setFormError("");
      setError(null);
      setSuccess(null);

      const updatedConfig = {
        ...emailConfig,
        [formData.type]: [...currentEmails, formData.email.toLowerCase()],
      };

      await saveEmailConfig(updatedConfig);

      setFormData({
        email: "",
        type: formData.type
      });

      setSuccess("Email added successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add email");
      console.error("Error adding email:", err);
    } finally {
      setSaving(false);
    }
  };

  // Handle sender email update
  const handleFromEmailSave = async () => {
    setFromEmailError("");
    if (!validateEmail(fromEmail)) {
      setFromEmailError("Please enter a valid email address");
      return;
    }

    try {
      setFromEmailSaving(true);
      setError(null);
      setSuccess(null);

      const updatedConfig = {
        ...emailConfig,
        fromEmail: fromEmail.trim().toLowerCase(),
      };

      await saveEmailConfig(updatedConfig);

      toast({
        title: "Success",
        description: "Sender email updated successfully",
        variant: "default",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update sender email";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setFromEmailSaving(false);
    }
  };

  // Helper function to get email icon based on type
  const getEmailIcon = (type: keyof EmailConfig) => {
    switch (type) {
      case "dailyReports":
        return <Mail className="h-4 w-4" />;
      case "hourlyReports":
        return <Clock className="h-4 w-4" />;
      case "immediateAlerts":
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Mail className="h-4 w-4" />;
    }
  };

  // Helper function to get email title based on type
  const getEmailTitle = (type: keyof EmailConfig) => {
    switch (type) {
      case "dailyReports":
        return "Daily Report Emails";
      case "hourlyReports":
        return "Hourly Report Emails";
      case "immediateAlerts":
        return "Immediate Alert Emails";
      default:
        return "Email Notifications";
    }
  };

  // Helper function to get email description based on type
  const getEmailDescription = (type: keyof EmailConfig) => {
    switch (type) {
      case "dailyReports":
        return "Recipients who receive daily network performance reports at 23:59";
      case "hourlyReports":
        return "Recipients who receive hourly outage reports";
      case "immediateAlerts":
        return "Recipients who receive immediate notifications when alarms are detected";
      default:
        return "Email notification settings";
    }
  };

  // Handle SMTP settings save
  const handleSmtpSave = async () => {
    setSmtpError("");
    if (!smtpUser.trim()) {
      setSmtpError("SMTP user is required");
      return;
    }
    if (!smtpPass.trim() && !emailConfig.smtpPass) {
      setSmtpError("SMTP password is required");
      return;
    }

    try {
      setSmtpSaving(true);
      setError(null);
      setSuccess(null);

      const updatedConfig: EmailConfig = {
        ...emailConfig,
        smtpPass: undefined,
        smtpUser: smtpUser.trim(),
        smtpHost: smtpHost.trim(),
        smtpPort: parseInt(smtpPort, 10) || 587,
        smtpSecure,
      };

      if (smtpPass && smtpPass !== "********") {
        updatedConfig.smtpPass = smtpPass;
      }

      const saved = await saveEmailConfig(updatedConfig);
      setSuccess("SMTP settings saved successfully");

      setSmtpPass(saved.smtpPass || "");

      setSmtpStatus({
        connected: false,
        message: "Not tested",
        lastChecked: null,
      });

      await checkSmtpStatus({
        smtpHost: smtpHost.trim(),
        smtpPort,
        smtpUser: smtpUser.trim(),
        smtpSecure,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save SMTP settings";
      setError(message);
      console.error("Error saving SMTP settings:", err);
    } finally {
      setSmtpSaving(false);
    }
  };

  // Test SMTP connection
  const checkSmtpStatus = async (override?: {
    smtpHost?: string;
    smtpPort?: string;
    smtpUser?: string;
    smtpPass?: string;
    smtpSecure?: boolean;
  }) => {
    setTestingSmtp(true);

    const smtpHostValue = (override?.smtpHost ?? smtpHost).trim();
    const smtpPortValue = parseInt(override?.smtpPort ?? smtpPort, 10) || 587;
    const smtpUserValue = (override?.smtpUser ?? smtpUser).trim();
    const smtpPassValue = override?.smtpPass ?? smtpPass;
    const smtpSecureValue = override?.smtpSecure ?? smtpSecure;

    try {
      const payload: Record<string, any> = {
        smtpHost: smtpHostValue,
        smtpPort: smtpPortValue,
        smtpUser: smtpUserValue,
        smtpSecure: smtpSecureValue,
      };

      if (smtpPassValue && smtpPassValue !== "********") {
        payload.smtpPass = smtpPassValue;
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/email/test`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to test SMTP connection");
      }

      setSmtpStatus({
        connected: data.connected,
        message: data.message || "Connection successful",
        lastChecked: new Date(),
      });

      try {
        const configKey = getSmtpConfigKey({
          smtpHost: smtpHostValue,
          smtpPort: String(smtpPortValue),
          smtpUser: smtpUserValue,
          smtpSecure: !!smtpSecureValue,
        });
        localStorage.setItem(
          smtpStatusStorageKey,
          JSON.stringify({
            configKey,
            connected: !!data.connected,
            message: data.message || "Connection successful",
            lastChecked: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.error("Error saving SMTP status:", err);
      }

      toast({
        title: data.connected ? "Success" : "Warning",
        description: data.message || (data.connected ? "SMTP connection successful" : "SMTP connection failed"),
        variant: data.connected ? "default" : "destructive",
      });

      return data.connected;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to test SMTP connection";
      setSmtpStatus({
        connected: false,
        message,
        lastChecked: new Date(),
      });

      try {
        const configKey = getSmtpConfigKey({
          smtpHost: smtpHostValue,
          smtpPort: String(smtpPortValue),
          smtpUser: smtpUserValue,
          smtpSecure: !!smtpSecureValue,
        });
        localStorage.setItem(
          smtpStatusStorageKey,
          JSON.stringify({
            configKey,
            connected: false,
            message,
            lastChecked: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.error("Error saving SMTP status:", err);
      }

      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });

      return false;
    } finally {
      setTestingSmtp(false);
    }
  };

  // Handle SMTP test button click
  const handleTestSmtp = async () => {
    await checkSmtpStatus();
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
          <h2 className="text-2xl font-bold text-foreground">
            Email Management
          </h2>
          <p className="text-muted-foreground mt-1">
            Manage email recipients for different notification types
          </p>
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
          <AlertDescription className="text-green-400">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {/* Sender Email Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Sender Email Address
          </CardTitle>
          <CardDescription>
            Set the email address used as the sender ("From") for all outgoing
            notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="fromEmail">Sender Email</Label>
              <Input
                id="fromEmail"
                type="email"
                value={fromEmail}
                onChange={(e) => {
                  setFromEmail(e.target.value);
                  setFromEmailError("");
                }}
                placeholder="Enter sender email address"
                className={fromEmailError ? "border-red-500" : ""}
              />
              {fromEmailError && (
                <p className="text-red-400 text-sm mt-1">{fromEmailError}</p>
              )}
            </div>
            <Button
              onClick={handleFromEmailSave}
              disabled={fromEmailSaving || !fromEmail.trim()}
              className="w-full md:w-auto"
            >
              {fromEmailSaving ? "Saving..." : "Save Sender Email"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SMTP Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            SMTP Configuration
          </CardTitle>
          <CardDescription>
            Configure SMTP server settings for sending emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <Label htmlFor="smtpHost">SMTP Host</Label>
                <Input
                  id="smtpHost"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.example.com"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="smtpPort">SMTP Port</Label>
                <Input
                  id="smtpPort"
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="587"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="smtpUser">SMTP Username</Label>
                <Input
                  id="smtpUser"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="user@example.com"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="smtpPassword">SMTP Password</Label>
                <Input
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder="SMTP Password"
                  className="mt-1"
                />
                {smtpPass === "********" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Password is hidden for security. Leave blank to keep current password.
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  id="smtpSecure"
                  checked={smtpSecure}
                  onCheckedChange={setSmtpSecure}
                />
                <Label htmlFor="smtpSecure">Use SSL/TLS</Label>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h3 className="font-medium mb-2">SMTP Connection Status</h3>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <Badge variant={smtpStatus.connected ? "default" : "destructive"}>
                      {smtpStatus.connected ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>

                  <div className="flex items-start justify-between">
                    <span className="text-sm font-medium">Message:</span>
                    <span className="text-sm text-muted-foreground text-right">
                      {smtpStatus.message}
                    </span>
                  </div>

                  {smtpStatus.lastChecked && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Last checked:</span>
                      <span>
                        {new Date(smtpStatus.lastChecked).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={handleTestSmtp}
                    disabled={!smtpUser || !smtpHost || !smtpPort || testingSmtp}
                    className="w-full"
                  >
                    {testingSmtp ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <TestTube2 className="mr-2 h-4 w-4" />
                        Test Connection
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 border border-blue-200 dark:border-blue-800">
                <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2 flex items-center">
                  <Info className="h-4 w-4 mr-2" />
                  SMTP Configuration Tips
                </h3>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc pl-5">
                  <li>For Gmail, use smtp.gmail.com with port 587 (TLS) or 465 (SSL)</li>
                  <li>You may need to enable "Less secure app access" or use an App Password for Gmail</li>
                  <li>For Office 365, use smtp.office365.com with port 587</li>
                  <li>For AWS SES, use email-smtp.[region].amazonaws.com with port 587 or 2587</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 border-t">
          <Button
            onClick={handleSmtpSave}
            disabled={smtpSaving}
            className="ml-auto"
          >
            {smtpSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save SMTP Settings
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Add Email Recipients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Email Recipients
          </CardTitle>
          <CardDescription>
            Add email addresses to receive different types of notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddEmail} className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Enter email address"
                  className={formError ? "border-red-500" : ""}
                />
                {formError && (
                  <p className="text-red-400 text-sm mt-1">{formError}</p>
                )}
              </div>
              <div className="md:w-48">
                <Label htmlFor="type">Notification Type</Label>
                <select
                  id="type"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  className="w-full px-3 py-2 bg-background border border-input rounded text-foreground"
                >
                  <option value="dailyReports">Daily Reports</option>
                  <option value="hourlyReports">Hourly Reports</option>
                  <option value="immediateAlerts">Immediate Alerts</option>
                </select>
              </div>
            </div>
            <Button
              type="submit"
              disabled={saving || !formData.email.trim()}
              className="w-full md:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              {saving ? "Adding..." : "Add Email"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {(['dailyReports', 'hourlyReports', 'immediateAlerts'] as const).map((type) => {
          const emails: string[] = Array.isArray(emailConfig[type])
            ? emailConfig[type]
            : [];
          return (
            <Card key={type}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {getEmailIcon(type)}
                  {getEmailTitle(type)}
                  <Badge variant="secondary" className="ml-auto">
                    {emails.length}
                  </Badge>
                </CardTitle>
                <CardDescription>{getEmailDescription(type)}</CardDescription>
              </CardHeader>
              <CardContent>
                {emails.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No email recipients configured</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {emails.map((email) => (
                      <div
                        key={email}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded group"
                      >
                        <span className="text-sm text-foreground truncate flex-1">
                          {email}
                        </span>
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
          );
        })}
      </div>

      {/* Summary Information */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration Summary</CardTitle>
          <CardDescription>
            Current email notification configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded">
              <Mail className="h-8 w-8 mx-auto mb-2 text-blue-500" />
              <div className="text-2xl font-bold">
                {emailConfig.dailyReports.length}
              </div>
              <div className="text-sm text-muted-foreground">
                Daily Report Recipients
              </div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded">
              <Clock className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <div className="text-2xl font-bold">
                {emailConfig.hourlyReports.length}
              </div>
              <div className="text-sm text-muted-foreground">
                Hourly Report Recipients
              </div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500" />
              <div className="text-2xl font-bold">
                {emailConfig.immediateAlerts.length}
              </div>
              <div className="text-sm text-muted-foreground">
                Immediate Alert Recipients
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailManagement;
