
import { WelcomeService } from '../src/services/WelcomeService.js';
import GroupRepository from '../src/repositories/GroupRepository.js';
import assert from 'assert';

// Simple Mocking System
const mocks = {
  GroupRepository: {
    getConfig: async () => ({ welcome: { enabled: true, message: 'Welcome @user' } }),
    getById: async () => ({ name: 'Test Group' })
  },
  sock: {
    sendMessage: async () => true,
    getContactById: async () => ({ id: { _serialized: '123@c.us' }, pushname: 'TestUser' }),
    getProfilePicUrl: async () => null
  }
};

// Monkey patch repositories
GroupRepository.getConfig = mocks.GroupRepository.getConfig;
GroupRepository.getById = mocks.GroupRepository.getById;

async function runTests() {
  console.log('🧪 Starting Welcome System Tests...');

  // Test 1: Successful Welcome
  try {
    console.log('Test 1: Successful Welcome');
    let messageSent = false;
    const sock = {
      ...mocks.sock,
      sendMessage: async (jid, msg, opts) => {
        messageSent = true;
        assert.ok(jid.includes('g.us'), 'Target JID should be a group');
        assert.ok(msg.includes('Welcome'), 'Message should contain welcome text');
        assert.ok(opts.mentions.length > 0, 'Should include mentions');
        return true;
      }
    };

    await WelcomeService.sendWelcome(sock, '123@g.us', '555@c.us', 'User');
    assert.ok(messageSent, 'Welcome message should be sent');
    console.log('✅ Passed');
  } catch (e) {
    console.error('❌ Failed:', e);
  }

  // Test 2: Retry Mechanism & Fallback
  try {
    console.log('Test 2: Retry & Fallback');
    let attempts = 0;
    let fallbackSent = false;
    
    // Mock processWelcome to always fail
    const originalProcess = WelcomeService.processWelcome;
    WelcomeService.processWelcome = async () => {
      attempts++;
      throw new Error('Simulated Failure');
    };

    const sock = {
      ...mocks.sock,
      sendMessage: async (jid, msg) => {
        if (msg.includes('Bienvenido')) {
          fallbackSent = true;
        }
        return true;
      }
    };

    await WelcomeService.sendWelcome(sock, '123@g.us', '555@c.us', 'User');
    
    // Restore
    WelcomeService.processWelcome = originalProcess;

    assert.equal(attempts, 3, 'Should attempt 3 times');
    assert.ok(fallbackSent, 'Fallback message should be sent after retries');
    console.log('✅ Passed');
  } catch (e) {
    console.error('❌ Failed:', e);
  }

  console.log('🏁 Tests Completed');
}

runTests().catch(console.error);
