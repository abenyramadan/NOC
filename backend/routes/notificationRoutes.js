import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getNotificationRules,
  createNotificationRule,
  updateNotificationRule,
  deleteNotificationRule,
  toggleNotificationRule,
  getNotificationSettings,
  updateNotificationSettings
} from '../controllers/notificationController.js';

const router = express.Router();

// Protect all routes with authentication
router.use(authenticate);

// Notification Rules
router.route('/notification-rules')
  .get(authorize('admin'), getNotificationRules)
  .post(authorize('admin'), createNotificationRule);

router.route('/notification-rules/:id')
  .put(authorize('admin'), updateNotificationRule)
  .delete(authorize('admin'), deleteNotificationRule);

router.put('/notification-rules/:id/toggle', authorize('admin'), toggleNotificationRule);

// Notification Settings
router.route('/notification-settings')
  .get(authorize('admin'), getNotificationSettings)
  .put(authorize('admin'), updateNotificationSettings);

export default router;
