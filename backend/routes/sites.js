import express from 'express';
import { body, validationResult } from 'express-validator';
import Site from '../models/Site.js';
import { authenticate, authorize } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

const router = express.Router();

/**
 * @route GET /api/sites
 * @desc Get all sites with optional filters
 * @access Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      state,
      city,
      transmission,
      status,
      search,
      page = 1,
      limit = 50
    } = req.query;

    let query = {};

    // Apply filters
    if (state) query.state = new RegExp(state, 'i');
    if (city) query.city = new RegExp(city, 'i');
    if (transmission) query.transmission = transmission;
    if (status) query.status = status;

    // Text search across siteName and city
    if (search) {
      query.$text = { $search: search };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sites = await Site.find(query)
      .sort({ siteName: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Site.countDocuments(query);

    res.json({
      sites,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        count: sites.length,
        totalSites: total
      }
    });
  } catch (error) {
    console.error('Error fetching sites:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/sites/:id
 * @desc Get single site by ID
 * @access Private
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const site = await Site.findById(req.params.id);
    if (!site) {
      return res.status(404).json({ message: 'Site not found' });
    }
    res.json({ site });
  } catch (error) {
    console.error('Error fetching site:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/sites
 * @desc Create new site (admin only)
 * @access Private (Admin)
 */
router.post('/', authenticate, authorize('admin'), [
  body('siteId').trim().notEmpty().withMessage('Site ID is required'),
  body('siteName').trim().notEmpty().withMessage('Site name is required'),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('transmission').isIn(['Microwave', 'VSAT', 'Fiber']).withMessage('Valid transmission type is required'),
  body('supervisor').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const siteData = req.body;

    // Check if site ID already exists
    const existingSite = await Site.findOne({ siteId: siteData.siteId });
    if (existingSite) {
      return res.status(400).json({ message: 'Site ID already exists' });
    }

    const site = new Site(siteData);
    await site.save();

    res.status(201).json({
      message: 'Site created successfully',
      site
    });
  } catch (error) {
    console.error('Error creating site:', error);
    if (error.code === 11000) {
      res.status(400).json({ message: 'Site ID already exists' });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * @route PUT /api/sites/:id
 * @desc Update site (admin only)
 * @access Private (Admin)
 */
router.put('/:id', authenticate, authorize('admin'), [
  body('siteName').optional().trim().notEmpty().withMessage('Site name cannot be empty'),
  body('state').optional().trim().notEmpty().withMessage('State cannot be empty'),
  body('city').optional().trim().notEmpty().withMessage('City cannot be empty'),
  body('transmission').optional().isIn(['Microwave', 'VSAT', 'Fiber']).withMessage('Valid transmission type is required'),
  body('status').optional().isIn(['On Air', 'Off Air', 'Maintenance', 'Planned']).withMessage('Valid status is required'),
  body('supervisor').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const updates = req.body;

    const site = await Site.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!site) {
      return res.status(404).json({ message: 'Site not found' });
    }

    res.json({
      message: 'Site updated successfully',
      site
    });
  } catch (error) {
    console.error('Error updating site:', error);
    if (error.code === 11000) {
      res.status(400).json({ message: 'Site ID already exists' });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

/**
 * @route DELETE /api/sites/:id
 * @desc Delete site (admin only)
 * @access Private (Admin)
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const site = await Site.findByIdAndDelete(id);

    if (!site) {
      return res.status(404).json({ message: 'Site not found' });
    }

    res.json({ message: 'Site deleted successfully' });
  } catch (error) {
    console.error('Error deleting site:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route GET /api/sites/stats
 * @desc Get sites statistics
 * @access Private
 */
router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    const stats = await Site.aggregate([
      {
        $group: {
          _id: null,
          totalSites: { $sum: 1 },
          onAirSites: {
            $sum: { $cond: [{ $eq: ['$status', 'On Air'] }, 1, 0] }
          },
          offAirSites: {
            $sum: { $cond: [{ $eq: ['$status', 'Off Air'] }, 1, 0] }
          },
          microwaveSites: {
            $sum: { $cond: [{ $eq: ['$transmission', 'Microwave'] }, 1, 0] }
          },
          vsatSites: {
            $sum: { $cond: [{ $eq: ['$transmission', 'VSAT'] }, 1, 0] }
          }
        }
      }
    ]);

    const stateStats = await Site.aggregate([
      {
        $group: {
          _id: '$state',
          count: { $sum: 1 },
          onAir: { $sum: { $cond: [{ $eq: ['$status', 'On Air'] }, 1, 0] } }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      summary: stats[0] || {
        totalSites: 0,
        onAirSites: 0,
        offAirSites: 0,
        microwaveSites: 0,
        vsatSites: 0
      },
      byState: stateStats
    });
  } catch (error) {
    console.error('Error fetching site stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /api/sites/import-csv
 * @desc Import sites from CSV file (admin only)
 * @access Private (Admin)
 */
router.post('/import-csv', authenticate, authorize('admin'), async (req, res) => {
  try {
    const csvFilePath = path.join(process.cwd(), 'backend', 'sites.csv');

    if (!fs.existsSync(csvFilePath)) {
      return res.status(404).json({ message: 'CSV file not found' });
    }

    const results = [];
    let processed = 0;
    let skipped = 0;

    // Read CSV file
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', async (data) => {
        try {
          // Skip header row and empty rows
          if (data['S.no'] === 'S.no' || !data['Site ID']) {
            return;
          }

          // Check if site already exists
          const existingSite = await Site.findOne({ siteId: data['Site ID'] });
          if (existingSite) {
            skipped++;
            return;
          }

          // Create new site
          const site = new Site({
            siteId: data['Site ID'],
            siteName: data['Site Name'],
            state: data['STATE'],
            city: data['City'],
            transmission: data['Transmission'],
            status: data['STATUS'] === 'On Air' ? 'On Air' : 'Off Air',
            supervisor: data['SUPERVISOR'],
            region: data['STATE'] // Use state as region for now
          });

          await site.save();
          results.push(site);
          processed++;
        } catch (error) {
          console.error('Error processing CSV row:', error);
          skipped++;
        }
      })
      .on('end', () => {
        res.json({
          message: `CSV import completed. Processed: ${processed}, Skipped: ${skipped}`,
          imported: processed,
          skipped: skipped,
          total: processed + skipped
        });
      });

  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
