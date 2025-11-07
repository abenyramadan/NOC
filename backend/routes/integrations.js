import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.js';
import { integrationManager } from '../integrations/IntegrationManager.js';

const router = express.Router();

/**
 * @route GET /api/integrations
 * @desc Get all integrations status
 * @access Private (Admin)
 */
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const status = integrationManager.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting integrations status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/integrations/test
 * @desc Test all integrations
 * @access Private (Admin)
 */
router.post('/test', authenticate, authorize('admin'), async (req, res) => {
  try {
    console.log('🧪 Testing all integrations...');
    const results = await integrationManager.testAllIntegrations();
    res.json({ results });
  } catch (error) {
    console.error('Error testing integrations:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/integrations/sync
 * @desc Manually trigger sync for all integrations
 * @access Private (Admin)
 */
router.post('/sync', authenticate, authorize('admin'), async (req, res) => {
  try {
    console.log('🔄 Manual sync triggered...');
    const results = await integrationManager.syncAllIntegrations();
    res.json({ results });
  } catch (error) {
    console.error('Error syncing integrations:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/integrations/sync/:integration
 * @desc Manually trigger sync for specific integration
 * @access Private (Admin)
 */
router.post('/sync/:integration', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { integration } = req.params;
    const integrationInstance = integrationManager.getIntegration(integration);

    if (!integrationInstance) {
      return res.status(404).json({ message: 'Integration not found' });
    }

    console.log(`🔄 Manual sync triggered for ${integration}...`);
    const result = await integrationInstance.syncAlarms();
    res.json({ [integration]: result });
  } catch (error) {
    console.error(`Error syncing ${req.params.integration}:`, error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/integrations/configure
 * @desc Configure integrations (mainly for testing)
 * @access Private (Admin)
 */
router.post('/configure', authenticate, authorize('admin'), [
  body('neteco').optional().isObject(),
  body('imasterNce').optional().isObject(),
  body('imasterMae').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // This would typically save to database or config file
    // For now, just reconfigure from environment variables
    integrationManager.configureIntegrations();

    res.json({
      message: 'Integrations configured successfully',
      integrations: integrationManager.getStatus()
    });
  } catch (error) {
    console.error('Error configuring integrations:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/integrations/:integration/status
 * @desc Get specific integration status
 * @access Private (Admin)
 */
router.get('/:integration/status', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { integration } = req.params;
    const integrationInstance = integrationManager.getIntegration(integration);

    if (!integrationInstance) {
      return res.status(404).json({ message: 'Integration not found' });
    }

    const status = {
      name: integrationInstance.name,
      enabled: integrationInstance.enabled,
      config: {
        baseUrl: integrationInstance.baseUrl,
        hasAuth: !!(integrationInstance.apiKey || integrationInstance.username)
      }
    };

    res.json(status);
  } catch (error) {
    console.error('Error getting integration status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/integrations/stats
 * @desc Get integration statistics
 * @access Private (Admin)
 */
router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    // This would typically aggregate stats from all integrations
    // For now, return basic integration info
    const stats = {
      totalIntegrations: integrationManager.integrations.size,
      enabledIntegrations: Array.from(integrationManager.integrations.values())
        .filter(i => i.enabled).length,
      integrations: Array.from(integrationManager.integrations.keys()),
      isRunning: integrationManager.isRunning
    };

    res.json(stats);
  } catch (error) {
    console.error('Error getting integration stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
