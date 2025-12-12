// Load environment variables first
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
const envPath = path.join(__dirname, '.env');
console.log('🔍 Loading environment variables from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('❌ Error loading .env file:', result.error);
  process.exit(1);
}

console.log('✅ Environment variables loaded successfully');
console.log('🔍 SMTP_USER:', process.env.SMTP_USER ? 'Set' : 'NOT SET');
console.log('🔍 SMTP_PASS:', process.env.SMTP_PASS ? 'Set (' + process.env.SMTP_PASS.length + ' chars)' : 'NOT SET');
console.log('🔍 FROM_EMAIL:', process.env.FROM_EMAIL || 'NOT SET');
console.log('🔍 NOC_ALERTS_EMAIL:', process.env.NOC_ALERTS_EMAIL || 'NOT SET');

// Now import other dependencies
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Import the email service getter function
import { getEmailService } from './services/emailService.js';
import authRoutes from './routes/auth.js';
import siteRoutes from './routes/sites.js';
import alarmRoutes from './routes/alarms.js';
import auditRoutes from './routes/audit.js';
import ticketRoutes from './routes/tickets.js';
import integrationRoutes from './routes/integrations.js';
import reportsRoutes from './routes/reports.js';
import outageReportRoutes from './routes/outageReports.js';
import notificationRoutes from './routes/notificationRoutes.js';
import emailConfigRoutes from './routes/emailConfig.js';
import OutageReport from './models/OutageReport.js';

// Now import services that depend on environment variables
const emailService = getEmailService();
const { alarmProcessor } = await import('./services/alarmProcessor.js');
const { integrationManager } = await import('./integrations/IntegrationManager.js');
const { outageReportService } = await import('./services/outageReportService.js');
const { dailyReportService } = await import('./services/dailyReportService.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration
const corsOptions = {
  origin: function(origin, callback) {
    console.log('🔍 CORS request from origin:', origin);
    console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
    
    // In development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Allowing CORS in development mode');
      return callback(null, true);
    }
    
    // In production, only allow specific origins
    const allowedOrigins = [
      'http://localhost:8080', // Frontend dev server
      'http://localhost:8081',
      'http://127.0.0.1:8080', // Localhost alternative
      'http://192.168.133.41:8080',
      'http://192.168.133.55:8081'
    ];

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.includes(origin)) {
      console.log('✅ Allowing CORS for origin:', origin);
      callback(null, true);
    } else {
      console.log('❌ Blocking CORS for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));

// Log CORS errors for debugging
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    console.warn('CORS Error:', req.headers.origin, 'tried to access', req.originalUrl);
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }
  next(err);
});

app.use(express.static('public'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
.then(async () => {
  console.log('✅ Connected to MongoDB');

  // Start alarm processor
  try {
    await alarmProcessor.startWatching();
    console.log('👀 Alarm processor started');
  } catch (err) {
    console.error('Failed to start alarm processor:', err);
  }

  // Start outage report scheduler
  try {
    outageReportService.startScheduler();
    console.log('📊 Outage report scheduler started');
  } catch (err) {
    console.error('Failed to start outage report scheduler:', err);
  }

  // Start daily report scheduler
  try {
    dailyReportService.startScheduler();
    console.log('📅 Daily report scheduler started');
  } catch (err) {
    console.error('Failed to start daily report scheduler:', err);
  }

  // Configure integrations
  integrationManager.configureIntegrations();

  // Start automatic sync if enabled
  const syncInterval = parseInt(process.env.INTEGRATION_SYNC_INTERVAL) || 5; // minutes
  if (process.env.INTEGRATION_AUTO_SYNC !== 'false') {
    integrationManager.startAutoSync(syncInterval);
    console.log(`🔄 Auto-sync started (every ${syncInterval} minutes)`);
  }
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/alarms', alarmRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/outage-reports', outageReportRoutes);
app.use('/api', notificationRoutes);
app.use('/api/email', emailConfigRoutes);

// Handle outage report form submissions from emails
app.post('/update-from-email', async (req, res) => {
  try {
    const formData = req.body;
    console.log('📧 Received form data:', JSON.stringify(formData, null, 2));

    const updates = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each report update
    for (const [key, value] of Object.entries(formData)) {
      if (key.startsWith('rootCause_') || key.startsWith('username_') ||
          key.startsWith('resolutionTime_') || key.startsWith('status_')) {

        const reportId = key.split('_')[1];
        console.log(`🔍 Processing field: ${key} = ${value}`);
        console.log(`📋 Extracted reportId: '${reportId}' (type: ${typeof reportId}, length: ${reportId?.length})`);
        
        if (!reportId) {
          console.log(`⚠️ No reportId found in field: ${key}`);
          continue;
        }

        // Validate ObjectId format
        if (reportId.length !== 24) {
          console.log(`❌ Invalid ObjectId length for ${reportId} (expected 24, got ${reportId.length})`);
          errorCount++;
          updates.push({
            reportId,
            field,
            value,
            status: 'error',
            message: `Invalid ObjectId length: ${reportId.length}`
          });
          continue;
        }

        const field = key.split('_')[0];
        const updateData = {};

        switch (field) {
          case 'rootCause':
            if (value && value.trim()) updateData.rootCause = value.trim();
            break;
          case 'username':
            if (value && value.trim()) updateData.username = value.trim();
            break;
          case 'resolutionTime':
            if (value && value.trim()) {
              updateData.resolutionTime = new Date(value);
            }
            break;
          case 'status':
            if (value && value.trim()) updateData.status = value.trim();
            break;
        }

        // Only update if there's actual data to update
        if (Object.keys(updateData).length > 0) {
          try {
            console.log(`🔍 Searching for report with ID: ${reportId}`);
            // Use the outage report service to update
            const updatedReport = await OutageReport.findByIdAndUpdate(
              reportId,
              {
                ...updateData,
                updatedAt: new Date(),
                updatedBy: null // Email submission - no logged-in user
              },
              { new: true, runValidators: true }
            );

            if (updatedReport) {
              successCount++;
              console.log(`✅ Successfully updated report ${reportId}`);
              updates.push({
                reportId,
                field,
                value,
                status: 'success'
              });
            } else {
              errorCount++;
              console.log(`❌ Report not found: ${reportId}`);
              updates.push({
                reportId,
                field,
                value,
                status: 'error',
                message: 'Report not found'
              });
            }
          } catch (error) {
            errorCount++;
            console.log(`❌ Error updating report ${reportId}: ${error.message}`);
            updates.push({
              reportId,
              field,
              value,
              status: 'error',
              message: error.message
            });
          }
        } else {
          console.log(`⚠️ No data to update for field ${key}`);
        }
      }
    }

    // Redirect to result page with query parameters
    const queryParams = new URLSearchParams({
      success: successCount > 0 ? 'true' : 'false',
      updated: successCount.toString(),
      errors: errorCount.toString()
    });

    res.redirect(`/update-result.html?${queryParams.toString()}`);

  } catch (error) {
    console.error('Error processing email form submission:', error);
    res.redirect(`/update-result.html?error=${encodeURIComponent(error.message)}`);
  }
});

// Serve the update result page with template variables
app.get('/update-result.html', (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NOCALERT - Update Outage Reports</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .success {
                background-color: #dcfce7;
                color: #16a34a;
                padding: 15px;
                border-radius: 4px;
                margin-bottom: 20px;
            }
            .error {
                background-color: #fee2e2;
                color: #dc2626;
                padding: 15px;
                border-radius: 4px;
                margin-bottom: 20px;
            }
            .button {
                background-color: #3b82f6;
                color: white;
                padding: 12px 24px;
                border: none;
                border-radius: 4px;
                text-decoration: none;
                display: inline-block;
                margin-top: 20px;
            }
            .button:hover {
                background-color: #2563eb;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>📝 NOCALERT Outage Report Updates</h1>

            ${req.query.success === 'true' ? `
                <div class="success">
                    ✅ <strong>Success!</strong> ${req.query.updated || 'Some'} outage report(s) updated successfully.
                </div>
            ` : ''}

            ${req.query.error ? `
                <div class="error">
                    ❌ <strong>Error:</strong> ${decodeURIComponent(req.query.error)}
                </div>
            ` : ''}

            ${(req.query.updated || req.query.errors) ? `
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                    <h3>📊 Update Summary:</h3>
                    <ul>
                        ${req.query.updated ? `<li style="color: #16a34a;">✅ ${req.query.updated} field(s) updated successfully</li>` : ''}
                        ${req.query.errors ? `<li style="color: #dc2626;">❌ ${req.query.errors} field(s) failed to update</li>` : ''}
                    </ul>
                </div>
            ` : ''}

            <p>Your outage report updates have been processed. You can now return to the NOCALERT application.</p>

            <a href="${frontendUrl}" class="button">Return to NOCALERT</a>

            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                <em>Note: If you don't click the button above, you can manually navigate back to the application.</em>
            </p>
        </div>
    </body>
    </html>
  `);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const integrationStatus = integrationManager.getStatus();

  res.json({
    status: 'OK',
    message: 'NOC Alert Backend API is running',
    timestamp: new Date().toISOString(),
    integrations: {
      count: integrationStatus.integrationsCount,
      enabled: integrationStatus.integrations.length,
      running: integrationStatus.isRunning
    },
    database: {
      connected: mongoose.connection.readyState === 1,
      name: mongoose.connection.name
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Validation Error',
      errors: Object.values(error.errors).map(err => err.message)
    });
  }

  if (error.name === 'UnauthorizedError') {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  res.status(500).json({
    message: 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { error: error.message })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 NOC Alert Backend running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

export default app;
