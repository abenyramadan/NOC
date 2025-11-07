import AuditLog from '../models/AuditLog.js';

export const logAudit = async (req, { action, target, details, status = 'success', userOverride }) => {
  try {
    const user = userOverride || (req.user && (req.user.username || req.user.name || req.user.email || req.user.id)) || 'system';
    const ipHeader = req.headers['x-forwarded-for'];
    const ipAddress = Array.isArray(ipHeader) ? ipHeader[0] : (ipHeader || req.ip || null);
    const userAgent = req.get ? req.get('user-agent') : (req.headers && req.headers['user-agent']);

    const entry = new AuditLog({
      user,
      action,
      target,
      details: typeof details === 'object' ? JSON.stringify(details) : (details || ''),
      status,
      timestamp: new Date(),
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    });

    await entry.save();
  } catch (err) {
    // Swallow audit log errors to avoid impacting main flow
  }
};
