import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('=== Environment Check ===');
console.log('NOC_EMAILS:', process.env.NOC_EMAILS);
console.log('NOC_ALERTS_EMAIL:', process.env.NOC_ALERTS_EMAIL);

if (process.env.NOC_EMAILS) {
  const recipients = process.env.NOC_EMAILS.split(',');
  console.log('Split recipients:', recipients);
  console.log('Recipients count:', recipients.length);
  recipients.forEach((recipient, i) => {
    console.log(`  ${i + 1}: "${recipient.trim()}"`);
  });
} else {
  console.log('NOC_EMAILS not found');
}
