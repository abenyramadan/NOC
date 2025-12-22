import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import HuaweiMaeAlarm from '../models/HuaweiMaeAlarm.js';

const router = express.Router();

// Get Huawei MAE alarms with filters
router.get('/alarms', authenticateToken, async (req, res) => {
  try {
    const { neName, severity, state, limit = 100 } = req.query;
    const query = {};
    
    if (neName) query.neName = new RegExp(neName, 'i');
    if (severity) query.severity = severity;
    if (state) query.state = state;
    
    const alarms = await HuaweiMaeAlarm.find(query)
      .sort({ occurtime: -1 })
      .limit(parseInt(limit));
      
    res.json(alarms);
  } catch (error) {
    console.error('Error fetching Huawei MAE alarms:', error);
    res.status(500).json({ message: 'Failed to fetch Huawei MAE alarms' });
  }
});

// Get Huawei MAE alarm statistics
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const stats = await HuaweiMaeAlarm.aggregate([
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 },
          active: {
            $sum: {
              $cond: [{ $regexMatch: { input: '$state', regex: 'Uncleared' } }, 1, 0]
            }
          }
        }
      }
    ]);

    const totalAlarms = await HuaweiMaeAlarm.countDocuments();
    const activeAlarms = await HuaweiMaeAlarm.countDocuments({
      state: { $in: ['Unacknowledged & Uncleared', 'Acknowledged & Uncleared'] }
    });
    const processingErrors = await HuaweiMaeAlarm.countDocuments({ processingStatus: 'error' });
    const mappedToNoc = await HuaweiMaeAlarm.countDocuments({ nocAlarmId: { $exists: true } });

    res.json({
      totalAlarms,
      activeAlarms,
      processingErrors,
      mappedToNoc,
      severityBreakdown: stats,
      lastUpdated: new Date()
    });
  } catch (error) {
    console.error('Error fetching Huawei MAE statistics:', error);
    res.status(500).json({ message: 'Failed to fetch statistics' });
  }
});

// Manually trigger alarm synchronization
router.post('/synchronize', authenticateToken, async (req, res) => {
  try {
    if (!req.huaweiMaeService) {
      return res.status(503).json({ message: 'Huawei MAE service is not enabled' });
    }
    
    await req.huaweiMaeService.requestSynchronization();
    res.json({ message: 'Synchronization requested successfully' });
  } catch (error) {
    console.error('Error during Huawei MAE synchronization:', error);
    res.status(500).json({ message: 'Failed to synchronize alarms', error: error.message });
  }
});

export default router;
