# Daily Alarm Tracking & Historical Data System

## Overview

The NOCALERT system now supports daily alarm tracking with complete historical data retention. This ensures you can monitor today's alarms while preserving the ability to view and analyze historical data.

## Features

### 1. **Daily Alarm View (Default)**
- ✅ Dashboard shows **today's alarms** by default
- ✅ Metrics cards display counts for **today's alarms only**
- ✅ Automatically updates at midnight to show new day
- ✅ Clean, focused view of current day's activities

### 2. **Date Selector**
- 📅 Pick any specific date to view historical alarms
- 📊 Metrics update to show selected day's statistics
- 🔍 Filter alarms by specific dates for analysis
- 📈 Compare alarm patterns across different days

### 3. **Historical Data Access**
- 📚 All alarms are permanently stored in the database
- ⏮️ View alarms from any previous date
- 📊 Access complete historical records
- 🔄 Toggle between daily view and full history

### 4. **Show All History Mode**
- ☑️ Checkbox to view all historical alarms at once
- 📈 See trends across extended time periods
- 🔍 Search across all historical data
- 📊 Maximum of 1000 most recent alarms in this mode

---

## How to Use

### **On the Dashboard**

1. **View Today's Alarms (Default)**
   - Dashboard loads with today's alarms automatically
   - Metrics show: Today's Critical, Major, Minor alarm counts
   - No action needed - this is the default view

2. **View a Specific Date**
   - Click the date picker (📅)
   - Select any past date
   - Dashboard updates to show that day's alarms and metrics

3. **View All Historical Data**
   - Check the "Show All History" checkbox
   - Date picker becomes disabled
   - View up to 1000 most recent alarms across all time

### **On the Alarms Page**

Same controls available:
- Date picker for specific days
- "Show All History" checkbox for full history
- All filters (severity, status, search) work with date selection

---

## Daily Reports

The system already includes comprehensive daily reports:

### **Access Daily Reports**
1. Navigate to **Reports** → **Daily Reports**
2. Select a date
3. View summary including:
   - Total reports
   - Open/In Progress/Resolved counts
   - MTTR (Mean Time To Resolution)
   - Alarms by root cause
   - Tickets per region
   - Critical alarms breakdown

### **Export to PDF**
- Click "Export to PDF" button
- Generates professional report with:
  - Summary statistics
  - Charts and tables
  - Root cause analysis
  - Regional breakdown

---

## Data Retention & Archival

### **Current Behavior**
- ✅ **All alarms are kept forever** by default
- ✅ Database automatically indexes for performance
- ✅ No automatic deletion
- ✅ Historical data always accessible

### **Optional Archival (Manual)**

For long-term data management, you can optionally archive or delete very old alarms:

```bash
# Preview what would be archived (safe - no changes)
cd backend
node scripts/archiveOldAlarms.js --days=90 --dry-run

# Archive alarms older than 90 days (marks as archived)
node scripts/archiveOldAlarms.js --days=90

# Delete alarms older than 180 days (permanent)
node scripts/archiveOldAlarms.js --days=180 --delete
```

**Recommended Schedule:**
- Keep 90 days for active monitoring
- Keep 180 days for compliance
- Keep 365 days for year-over-year analysis
- Archive beyond 365 days

---

## Database Performance

### **Automatic Optimizations**
1. **Indexed Fields**
   - `timestamp` - Fast date queries
   - `severity` - Quick filtering
   - `status` - Efficient status searches
   - `siteId` - Site-specific lookups

2. **Query Limits**
   - Daily view: 100 most recent alarms
   - History view: 1000 most recent alarms
   - Prevents database overload

3. **Date Filtering**
   - Server-side or client-side depending on mode
   - Optimized for performance
   - Fast response times

### **Monitoring Database Size**

```bash
# Check database statistics
mongosh noc-alerts --eval "db.stats()"

# Count total alarms
mongosh noc-alerts --eval "db.alarms.countDocuments()"

# Count alarms by date range
mongosh noc-alerts --eval "db.alarms.countDocuments({timestamp: {\$gte: new Date('2025-01-01')}})"
```

---

## API Endpoints

### **Get Alarms with Date Filter**
```javascript
GET /api/alarms?date=2025-10-22&limit=100

// Response
{
  "alarms": [...],
  "pagination": {
    "current": 1,
    "total": 5,
    "count": 100
  }
}
```

### **Get Daily Report**
```javascript
GET /api/outage-reports/daily?date=2025-10-22

// Response
{
  "reportDate": "2025-10-22",
  "summary": {
    "totalReports": 15,
    "totalOpen": 3,
    "totalInProgress": 5,
    "totalResolved": 7,
    "mttr": 120
  },
  "alarmsByRootCause": [...],
  "ticketsPerRegion": [...]
}
```

---

## Best Practices

### **For Daily Operations**
1. ✅ Use default daily view for monitoring
2. ✅ Check Daily Reports at end of each day
3. ✅ Export important daily reports to PDF
4. ✅ Review metrics trends weekly

### **For Historical Analysis**
1. 📊 Use date picker to compare specific days
2. 📈 Enable "Show All History" for trend analysis
3. 📉 Export Daily Reports for documentation
4. 🔍 Search across history for pattern detection

### **For Database Maintenance**
1. 💾 Monitor database size monthly
2. 🗄️ Archive data older than 180-365 days
3. 📦 Backup database before archival operations
4. 📊 Keep statistics for compliance (exports, reports)

---

## Automation Recommendations

### **Scheduled Tasks (Optional)**

#### **1. Daily Report Generation**
Already automated - runs every hour and generates reports.

#### **2. Monthly Archival** (Optional)
```bash
# Add to cron (runs 1st of every month at 2 AM)
0 2 1 * * cd /path/to/backend && node scripts/archiveOldAlarms.js --days=180 >> logs/archive.log 2>&1
```

#### **3. Database Backup** (Recommended)
```bash
# Daily backup at 3 AM
0 3 * * * mongodump --db noc-alerts --out /backups/mongodb/$(date +\%Y\%m\%d)
```

---

## Troubleshooting

### **Dashboard shows no alarms but there should be data**
- Check if correct date is selected
- Verify "Show All History" is unchecked
- Refresh the page
- Check backend logs for errors

### **Historical data not loading**
- Check database connection
- Verify alarms exist for selected date
- Try "Show All History" mode
- Check browser console for errors

### **Performance is slow**
- Reduce query limit in code
- Archive very old alarms
- Check database indexes
- Monitor server resources

---

## Summary

✅ **What's Working:**
- Daily alarm tracking with today as default
- Historical data fully preserved
- Date picker for specific day analysis
- "Show All History" for full access
- Daily Reports with export to PDF
- Automatic hourly report generation
- Email notifications for new alarms
- Supervisor auto-assignment from sites

✅ **Data Flow:**
1. Alarms created → Stored in database
2. Dashboard loads → Shows today's alarms
3. User selects date → Filters to that date
4. User enables history → Shows all alarms
5. Daily report runs → Generates summary
6. Export PDF → Professional documentation

✅ **No Data Loss:**
- All alarms preserved forever
- Historical analysis always available
- Optional archival for very old data
- Backup recommendations provided

---

## Support

For questions or issues:
1. Check this documentation first
2. Review backend logs: `backend/logs/`
3. Check database connections
4. Verify environment variables in `.env`
5. Test with sample data scripts

**Created:** October 22, 2025  
**Version:** 1.0  
**System:** NOCALERT Alarm Monitoring
