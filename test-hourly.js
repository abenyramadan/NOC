// Simple test to check if the hourly endpoint is working

async function testHourlyEndpoint() {
  try {
    console.log('🧪 Testing hourly reports endpoint...');

    // First, try to login
    console.log('🔐 Attempting login...');
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin123'
      })
    });

    if (!loginResponse.ok) {
      console.log('❌ Login failed, trying other credentials...');

      const credentials = [
        { username: 'test', password: 'test123' },
        { username: 'nocadmin', password: 'password' }
      ];

      for (const creds of credentials) {
        const resp = await fetch('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds)
        });
        if (resp.ok) {
          const data = await resp.json();
          console.log(`✅ Login successful with ${creds.username}`);
          return await testHourlyWithToken(data.token);
        }
      }

      console.log('❌ All login attempts failed');
      return;
    }

    const loginData = await loginResponse.json();
    console.log('✅ Login successful');

    await testHourlyWithToken(loginData.token);

  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

async function testHourlyWithToken(token) {
  try {
    console.log('📊 Testing hourly reports endpoint...');

    const response = await fetch('http://localhost:3000/api/outage-reports/hourly', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Hourly reports endpoint working!');
      console.log(`📈 Found ${data.ongoingOutages?.length || 0} ongoing outages`);
      console.log(`✅ Found ${data.resolvedOutages?.length || 0} resolved outages`);
      console.log(`📊 Found ${data.ticketsPerRegion?.length || 0} regions with data`);
    } else {
      const error = await response.text();
      console.log(`❌ Hourly reports failed: ${response.status} - ${error}`);
    }
  } catch (error) {
    console.log('❌ Hourly test failed:', error.message);
  }
}

testHourlyEndpoint();
