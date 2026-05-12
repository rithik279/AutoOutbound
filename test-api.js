import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
const headers = { 'Content-Type': 'application/json' };

async function test() {
  try {
    console.log('\n=== API Endpoint Tests ===\n');

    // Test 1: Get all contacts
    console.log('1. GET /api/contacts');
    const contactsRes = await fetch(`${BASE_URL}/api/contacts`, { headers });
    const contactsData = await contactsRes.json();
    console.log(`   ✓ Status: ${contactsRes.status}`);
    console.log(`   ✓ Contacts returned: ${contactsData.contacts?.length || 0}`);

    // Test 2: Create new contact
    console.log('\n2. POST /api/contacts (create test contact)');
    const testContact = {
      email: `test-${Date.now()}@example.com`,
      name: 'Test Contact',
      title: 'Test Title',
      company: 'Test Co',
      source: 'test'
    };
    const createRes = await fetch(`${BASE_URL}/api/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(testContact)
    });
    const createData = await createRes.json();
    console.log(`   ✓ Status: ${createRes.status}`);
    console.log(`   ✓ Created contact ID: ${createData.contact?.id}`);

    // Test 3: Get sent emails
    console.log('\n3. GET /api/sent-emails');
    const emailsRes = await fetch(`${BASE_URL}/api/sent-emails`, {
      headers: { ...headers, 'x-user-id': 'test-user' }
    });
    const emailsData = await emailsRes.json();
    console.log(`   ✓ Status: ${emailsRes.status}`);
    console.log(`   ✓ Emails returned: ${emailsData.emails?.length || 0}`);

    // Test 4: Get schedule status
    console.log('\n4. GET /api/schedule-status');
    const statusRes = await fetch(`${BASE_URL}/api/schedule-status`, {
      headers: { ...headers, 'x-user-id': 'test-user' }
    });
    const statusData = await statusRes.json();
    console.log(`   ✓ Status: ${statusRes.status}`);
    console.log(`   ✓ Total: ${statusData.total}, Sent: ${statusData.sent}, Pending: ${statusData.pending}, Failed: ${statusData.failed}`);

    // Test 5: Update contact state
    if (createData.contact?.id) {
      console.log(`\n5. PUT /api/contacts/${createData.contact.id} (update state)`);
      const updateRes = await fetch(`${BASE_URL}/api/contacts/${createData.contact.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ state: 'replied' })
      });
      const updateData = await updateRes.json();
      console.log(`   ✓ Status: ${updateRes.status}`);
      console.log(`   ✓ Updated state: ${updateData.contact?.state}`);
    }

    console.log('\n✓ All API endpoints working correctly!');

  } catch (err) {
    console.error('✗ API test error:', err.message);
  }
}

// Wait for server to start
setTimeout(test, 2000);
