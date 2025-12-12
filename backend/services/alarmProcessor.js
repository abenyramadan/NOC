import { emailService } from './emailService.js';
import Ticket from '../models/Ticket.js';
import OutageReport from '../models/OutageReport.js';
import Site from '../models/Site.js';
import mongoose from 'mongoose';

export class AlarmProcessor {
  constructor() {
    this.watching = false;
    this.changeStream = null;
  }

  async startWatching() {
    if (this.watching) {
      console.log('⚠️ Alarm processor is already watching');
      return;
    }

    try {
      const Alarm = mongoose.model('Alarm');
      this.changeStream = Alarm.watch([], { 
        fullDocument: 'updateLookup',
        fullDocumentBeforeChange: 'whenAvailable'
      });

      console.log('👀 Setting up MongoDB change stream for alarms...');

      this.changeStream.on('change', async (change) => {
        console.log(`🔄 Change detected in alarms collection:`, {
          operationType: change.operationType,
          collection: change.ns.coll,
          documentId: change.documentKey?._id
        });

        try {
          // Only process new alarm insertions
          if (change.operationType === 'insert') {
            const alarm = change.fullDocument;
            console.log(`🚨 New alarm detected:`, {
              id: alarm._id,
              siteId: alarm.siteId,
              siteName: alarm.siteName,
              severity: alarm.severity,
              alarmType: alarm.alarmType,
              description: alarm.description,
              source: alarm.source,
              timestamp: alarm.timestamp
            });
            
            // 1. Send email notification
            await this.sendAlarmEmail(alarm);
            
            // 2. Create a ticket
            await this.createTicket(alarm);
          } else if (change.operationType === 'update') {
            console.log(`📝 Alarm updated:`, {
              id: change.documentKey._id,
              updateFields: Object.keys(change.updateDescription.updatedFields || {})
            });
          } else if (change.operationType === 'delete') {
            console.log(`🗑️ Alarm deleted:`, {
              id: change.documentKey._id
            });
          }
        } catch (error) {
          console.error('❌ Error processing alarm change:', error);
          console.error('Error stack:', error.stack);
        }
      });

      this.changeStream.on('error', (error) => {
        console.error('❌ Change stream error:', error);
      });

      this.watching = true;
      console.log('✅ Successfully started watching for alarm changes');
    } catch (error) {
      console.error('❌ Error setting up change stream:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  async stopWatching() {
    if (this.changeStream) {
      await this.changeStream.close();
      this.watching = false;
      console.log('👋 Stopped watching for new alarms');
    }
  }

  async sendAlarmEmail(alarm) {
    try {
      console.log(`📧 Preparing to send email for alarm: ${alarm._id}`);
      
      // Add recipients to alarm object before sending
      const alarmWithRecipients = {
        ...alarm, // Remove .toObject() since change stream returns plain objects
        recipients: process.env.NOC_ALERTS_EMAIL ? 
          process.env.NOC_ALERTS_EMAIL.split(',') : 
          ['noc@example.com']
      };
      
      console.log(`📨 Sending email to: ${alarmWithRecipients.recipients.join(', ')}`);
      
      await emailService.sendAlarmNotification(alarmWithRecipients);
      
      console.log(`✅ Email sent successfully for alarm: ${alarm._id}`);
    } catch (error) {
      console.error(`❌ Failed to send email for alarm ${alarm._id}:`, error.message);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  async createTicket(alarm) {
    try {
      console.log(`🎫 Creating ticket for alarm: ${alarm._id}`);
      
      const ticketData = {
        alarmId: alarm._id,
        siteName: alarm.siteName,
        siteId: alarm.siteId,
        severity: alarm.severity,
        alarmType: alarm.alarmType,
        description: alarm.description,
        recipients: alarm.recipients || ['abenyramada@gmail.com'],
        emailSubject: `[${alarm.severity.toUpperCase()}] ${alarm.alarmType} - ${alarm.siteName}`,
        status: 'sent',
        priority: alarm.severity === 'critical' ? 'high' : 
                 alarm.severity === 'major' ? 'medium' : 'low',
        source: 'alarm',
        createdBy: new mongoose.Types.ObjectId(), // Create a new ObjectId for system user
        updatedBy: new mongoose.Types.ObjectId()  // Create a new ObjectId for system user
      };

      console.log(`📋 Ticket details:`, {
        alarmId: ticketData.alarmId,
        siteName: ticketData.siteName,
        severity: ticketData.severity,
        alarmType: ticketData.alarmType,
        status: ticketData.status
      });

      const savedTicket = await Ticket.create(ticketData);
      
      console.log(`✅ Ticket created successfully:`, {
        id: savedTicket._id,
        ticketId: savedTicket.ticketId,
        title: savedTicket.title,
        priority: savedTicket.priority,
        status: savedTicket.status
      });
      
      // IMMEDIATELY create outage report for user visibility
      await this.createOutageReportFromTicket(savedTicket, alarm);
      
      return savedTicket;
    } catch (error) {
      console.error(`❌ Failed to create ticket for alarm ${alarm._id}:`, error.message);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Create outage report immediately from ticket (for user visibility)
   */
  async createOutageReportFromTicket(ticket, alarm) {
    try {
      console.log(`📊 [OUTAGE REPORT] Starting outage report creation for ticket ${ticket._id}...`);
      console.log(`📊 [OUTAGE REPORT] Alarm details:`, {
        alarmId: alarm._id,
        siteId: alarm.siteId,
        siteName: alarm.siteName,
        severity: alarm.severity,
        timestamp: alarm.timestamp
      });

      // Get site details for region and supervisor
      console.log(`🔍 [OUTAGE REPORT] Looking up site with ID: ${alarm.siteId}`);
      let site = await Site.findOne({ siteId: alarm.siteId });
      
      if (!site) {
        console.warn(`⚠️ [OUTAGE REPORT] No site found with ID: ${alarm.siteId}`);
        // Try to find by name as fallback
        const siteByName = await Site.findOne({ name: alarm.siteName });
        if (siteByName) {
          console.log(`ℹ️ [OUTAGE REPORT] Found site by name: ${siteByName.siteId}`);
          site = siteByName;
        }
      }

      const actualRegion = site?.region || 'Unknown';
      const actualSupervisor = site?.supervisor || 'N/A';
      console.log(`🌍 [OUTAGE REPORT] Region: ${actualRegion}, Supervisor: ${actualSupervisor}`);

      // Determine region based on site name if not found
      const region = this.determineRegion(alarm.siteName, actualRegion);
      console.log(`📍 [OUTAGE REPORT] Determined region: ${region}`);

      // Get current hour for reportHour
      const now = new Date();
      const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
      console.log(`🕒 [OUTAGE REPORT] Current hour: ${currentHour}`);

      // Calculate expected restoration time based on alarm severity
      const expectedRestorationTime = calculateExpectedRestorationTime(alarm.severity, alarm.timestamp);
      const mandatoryRestorationTime = calculateMandatoryRestorationTime(alarm.severity, alarm.timestamp);
      console.log(`⏱️ [OUTAGE REPORT] Expected restoration: ${expectedRestorationTime}`);
      console.log(`⏱️ [OUTAGE REPORT] Mandatory restoration: ${mandatoryRestorationTime}`);

      const outageReportData = {
        siteNo: alarm.siteId || 'N/A',
        siteCode: alarm.siteName || 'Unknown',
        region: region,
        alarmType: alarm.severity.toUpperCase(),
        occurrenceTime: alarm.timestamp,
        alarmId: alarm._id,
        ticketId: ticket._id,
        supervisor: actualSupervisor,
        rootCause: 'Others', // Default, user can edit
        username: 'noc-team', // Default, user can edit
        resolutionTime: null,
        expectedRestorationTime: expectedRestorationTime,
        mandatoryRestorationTime: mandatoryRestorationTime,
        status: 'In Progress',
        reportHour: currentHour,
        expectedResolutionHours: alarm.severity === 'critical' ? 4 : 
                               alarm.severity === 'major' ? 8 : 24,
        createdBy: new mongoose.Types.ObjectId(),
        updatedBy: new mongoose.Types.ObjectId()
      };

      console.log(`📝 [OUTAGE REPORT] Creating outage report with data:`, JSON.stringify({
        ...outageReportData,
        // Don't log the entire document as it might be too large
        alarmType: outageReportData.alarmType,
        severity: alarm.severity,
        originalAlarmType: alarm.alarmType
      }, null, 2));
      
      const outageReport = new OutageReport(outageReportData);
      console.log(`💾 [OUTAGE REPORT] Saving outage report to database...`);
      
      // Add detailed error handling for save operation
      const savedReport = await outageReport.save()
        .then(doc => {
          console.log(`✅ [OUTAGE REPORT] Successfully created outage report:`, {
            id: doc._id,
            siteNo: doc.siteNo,
            siteCode: doc.siteCode,
            status: doc.status,
            alarmType: doc.alarmType
          });
          return doc;
        })
        .catch(error => {
          console.error(`❌ [OUTAGE REPORT] Failed to save outage report:`, {
            error: error.message,
            code: error.code,
            keyPattern: error.keyPattern,
            keyValue: error.keyValue,
            errors: error.errors ? Object.entries(error.errors).map(([key, err]) => ({
              field: key,
              message: err.message,
              type: err.kind,
              value: err.value
            })) : null,
            alarmData: {
              severity: alarm.severity,
              alarmType: alarm.alarmType,
              siteId: alarm.siteId,
              siteName: alarm.siteName
            },
            outageReportData: {
              ...outageReportData,
              // Don't log the entire document as it might be too large
              alarmType: outageReportData.alarmType,
              severity: alarm.severity
            }
          });
          throw error;
        });
      
      return savedReport;
    } catch (error) {
      console.error('❌ [OUTAGE REPORT] Critical error creating outage report:', {
        error: error.message,
        stack: error.stack,
        alarmId: alarm?._id,
        ticketId: ticket?._id,
        alarm: JSON.stringify(alarm, null, 2)
      });
      throw error;
    }
  }

  /**
   * Determine region based on site name
   */
  determineRegion(siteName, actualRegion) {
    if (actualRegion && actualRegion !== 'Unknown') {
      return actualRegion;
    }

    const name = siteName.toLowerCase();
    if (name.includes('juba') || name.includes('yei') || name.includes('terekeka')) {
      return 'C.E.S';
    } else if (name.includes('bor') || name.includes('pibor') || name.includes('kapoeta')) {
      return 'E.E.S';
    } else if (name.includes('wau') || name.includes('raja') || name.includes('tonj')) {
      return 'W.E.S';
    } else if (name.includes('malakal') || name.includes('kodok') || name.includes('nasir')) {
      return 'Upper Nile';
    } else if (name.includes('aweil') || name.includes('wunrok') || name.includes('kuajok')) {
      return 'Bahr gha zal';
    } else if (name.includes('bentiu') || name.includes('rubkona') || name.includes('leer')) {
      return 'Equatoria';
    }

    return 'C.E.S'; // Default
  }
}

/**
 * Calculate expected restoration time based on alarm severity
 * @param {string} severity - Alarm severity (critical, major, minor)
 * @param {Date} occurrenceTime - When the alarm occurred
 * @returns {Date} Expected restoration time
 */
function calculateExpectedRestorationTime(severity, occurrenceTime) {
  const baseTime = new Date(occurrenceTime);
  
  switch (severity.toLowerCase()) {
    case 'critical':
      // Critical alarms: expected within 4 hours
      baseTime.setHours(baseTime.getHours() + 4);
      break;
    case 'major':
      // Major alarms: expected within 8 hours
      baseTime.setHours(baseTime.getHours() + 8);
      break;
    case 'minor':
    default:
      // Minor alarms: expected within 24 hours
      baseTime.setHours(baseTime.getHours() + 24);
      break;
  }
  
  return baseTime;
}

/**
 * Calculate mandatory restoration time (SLA deadline) based on alarm severity
 * @param {string} severity - Alarm severity (critical, major, minor)
 * @param {Date} occurrenceTime - When the alarm occurred
 * @returns {Date} Mandatory restoration time (SLA deadline)
 */
function calculateMandatoryRestorationTime(severity, occurrenceTime) {
  const baseTime = new Date(occurrenceTime);
  
  switch (severity.toLowerCase()) {
    case 'critical':
      // Critical alarms: must be resolved within 6 hours (SLA)
      baseTime.setHours(baseTime.getHours() + 6);
      break;
    case 'major':
      // Major alarms: must be resolved within 12 hours (SLA)
      baseTime.setHours(baseTime.getHours() + 12);
      break;
    case 'minor':
    default:
      // Minor alarms: must be resolved within 48 hours (SLA)
      baseTime.setHours(baseTime.getHours() + 48);
      break;
  }
  
  return baseTime;
}

export const alarmProcessor = new AlarmProcessor();
