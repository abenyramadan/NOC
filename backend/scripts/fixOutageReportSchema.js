import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function fixOutageReportSchema() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get the current schema
    const outageReportSchema = mongoose.model('OutageReport').schema;
    
    // Check if the field exists with the wrong name
    if (outageReportSchema.obj.salarmType) {
      console.log('⚠️ Found incorrect field name "salarmType". Renaming to "alarmType"...');
      
      // Rename the field in the schema
      outageReportSchema.obj.alarmType = { ...outageReportSchema.obj.salarmType };
      delete outageReportSchema.obj.salarmType;
      
      // Rebuild the model with the updated schema
      const OutageReport = mongoose.model('OutageReport', outageReportSchema, 'outagereports');
      
      // Update all existing documents to move the value from salarmType to alarmType
      const result = await OutageReport.updateMany(
        { salarmType: { $exists: true } },
        [
          { $set: { alarmType: "$salarmType" } },
          { $unset: "salarmType" }
        ]
      );
      
      console.log(`✅ Successfully updated ${result.modifiedCount} documents`);
      console.log('✅ Schema updated successfully');
    } else if (outageReportSchema.obj.alarmType) {
      console.log('✅ Schema already has the correct field name "alarmType"');
    } else {
      console.log('❌ Neither "salarmType" nor "alarmType" found in the schema');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing outage report schema:', error);
    process.exit(1);
  }
}

fixOutageReportSchema();
