
import { MemberService } from '../src/services/MemberService.js';
import assert from 'assert';

// Mocking the Client and Contact objects
const createMockClient = (scenario: string) => {
  const contacts = new Map();
  
  // Setup scenario data
  if (scenario === 'direct') {
    contacts.set('123@c.us', { pushname: 'DirectUser', isBusiness: false });
  } else if (scenario === 'business') {
    contacts.set('456@c.us', { pushname: undefined, verifiedName: 'BusinessUser', isBusiness: true });
  } else if (scenario === 'hydration') {
    // Initial state: no name
    const contact: any = { 
      pushname: undefined, 
      isBusiness: false,
      getChat: async () => {
        // Simulate side-effect: after getChat, name becomes available
        contact.pushname = 'HydratedUser';
        return {};
      }
    };
    contacts.set('789@c.us', contact);
  } else if (scenario === 'empty') {
    contacts.set('000@c.us', { pushname: undefined, isBusiness: false, name: 'LocalName' });
  }

  return {
    getContactById: async (id: string) => {
      const c = contacts.get(id);
      return c || { pushname: undefined };
    }
  };
};

async function runTests() {
  console.log('🧪 Starting User Name Extraction Tests...');

  // Test 1: Direct Pushname
  try {
    console.log('Test 1: Direct Pushname Extraction');
    const client = createMockClient('direct');
    const name = await MemberService.extractUserProfileName(client, '123@c.us');
    assert.equal(name, 'DirectUser', 'Should extract pushname directly');
    console.log('✅ Passed');
  } catch (e) {
    console.error('❌ Failed:', e);
  }

  // Test 2: Business Verified Name
  try {
    console.log('Test 2: Business Verified Name Extraction');
    const client = createMockClient('business');
    const name = await MemberService.extractUserProfileName(client, '456@c.us');
    assert.equal(name, 'BusinessUser', 'Should extract verifiedName for business');
    console.log('✅ Passed');
  } catch (e) {
    console.error('❌ Failed:', e);
  }

  // Test 3: Hydration Mechanism
  try {
    console.log('Test 3: Hydration Mechanism (Lazy Loading)');
    const client = createMockClient('hydration');
    const startTime = Date.now();
    const name = await MemberService.extractUserProfileName(client, '789@c.us');
    const duration = Date.now() - startTime;
    
    assert.equal(name, 'HydratedUser', 'Should extract name after hydration');
    assert.ok(duration >= 500, 'Should wait at least 500ms for sync');
    console.log('✅ Passed');
  } catch (e) {
    console.error('❌ Failed:', e);
  }

  // Test 4: Fallback to Local Name (extractUserProfileName returns local name if pushname is missing)
  try {
    console.log('Test 4: Fallback to Local Name');
    const client = createMockClient('empty');
    const name = await MemberService.extractUserProfileName(client, '000@c.us');
    assert.equal(name, 'LocalName', 'Should fall back to local name');
    console.log('✅ Passed');
  } catch (e) {
    console.error('❌ Failed:', e);
  }

  console.log('🏁 Tests Completed');
}

runTests().catch(console.error);
