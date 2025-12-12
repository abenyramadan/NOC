import { emailService } from './services/emailService.js';

async function testEmail() {
  try {
    console.log('📧 Testing email service...');
    
    // Test basic email sending
    const result = await emailService.sendMail({
      to: 'abenyramada@gmail.com',
      subject: 'Test Email from NOC System',
      text: 'This is a test email to verify the email service is working correctly.',
      html: '<h1>Test Email</h1><p>If you receive this email, the email service is working properly!</p>'
    });
    
    console.log('✅ Email test result:', result);
    console.log('📋 Check your inbox for the test email');
    
  } catch (error) {
    console.error('❌ Email test failed:', error);
  }
}

testEmail();
