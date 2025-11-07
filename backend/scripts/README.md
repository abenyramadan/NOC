# Test Data Scripts

## Insert Test Outages and Alarms

This script generates realistic test data for the NOC Alert System.

### What it creates:
- **50 Outage Reports** with:
  - Random sites, regions, and alarm types
  - Realistic occurrence times (last 7 days)
  - Expected resolution hours based on severity
  - 70% resolved, 30% ongoing
  - Proper hourly distribution for reports
  
- **30 Alarms** with:
  - Random sites and regions
  - Various severity levels
  - Acknowledgment and clearance status

### How to run:

```bash
# From the backend directory
cd backend

# Run the script
node scripts/insertTestOutages.js
```

### Output:
The script will:
1. Connect to MongoDB
2. Clear existing test data (optional)
3. Insert 50 outage reports
4. Insert 30 alarms
5. Show a summary with statistics

### View the data:
After running the script, you can view the data in:
- **Outage Reports** page - See all outage reports
- **Hourly Reports** page - See hourly aggregated reports with SLA metrics
- **Alarms** page - See all alarms

### Notes:
- The script uses the MongoDB connection from your `.env` file
- Test data includes realistic timestamps, statuses, and SLA metrics
- Expected resolution hours are set based on alarm severity:
  - CRITICAL: 0.5-1 hour
  - MAJOR: 1-3 hours
  - MINOR: 4-24 hours
