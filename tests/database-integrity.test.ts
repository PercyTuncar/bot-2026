
import { MemberService } from '../src/services/MemberService.js';
import MemberRepository from '../src/repositories/MemberRepository.js';
import assert from 'assert';

// Mocking
const mocks = {
  MemberRepository: {
    findByPhoneOrLid: async () => null, // Simulate new member
    save: async (groupId, data) => data,
    update: async () => true
  },
  sock: {
    getContactById: async () => ({
      id: { _serialized: '555@c.us' },
      pushname: 'RealName',
      name: 'RealName',
      number: '555'
    })
  }
};

// Patch
MemberRepository.findByPhoneOrLid = mocks.MemberRepository.findByPhoneOrLid;
MemberRepository.save = mocks.MemberRepository.save;
MemberRepository.update = mocks.MemberRepository.update;

async function runTests() {
  console.log('🧪 Starting Database Integrity Tests...');

  // Test 1: Member Registration Structure (SPEC Section 3.2)
  try {
    console.log('Test 1: Member Registration Structure');
    let savedData = null;
    
    // Intercept save
    MemberRepository.save = async (groupId, data) => {
      savedData = data;
      return data;
    };

    const groupId = '123@g.us';
    const userId = '555@c.us';
    
    await MemberService.getOrCreateUnified(groupId, userId, mocks.sock);

    assert.ok(savedData, 'Data should be saved');
    assert.equal(savedData.phone, '555', 'Phone should be normalized (no suffix)');
    assert.equal(savedData.id, '555@c.us', 'ID should be @c.us format');
    assert.equal(savedData.pushname, 'RealName', 'Should capture pushname');
    assert.ok(savedData.joinedAt, 'Should have joinedAt timestamp');
    assert.ok(savedData.stats, 'Should have stats object');
    assert.equal(savedData.stats.totalPointsEarned, 0, 'Initial points should be 0');
    
    console.log('✅ Passed');
  } catch (e) {
    console.error('❌ Failed:', e);
  }

  // Test 2: LID/Phone Unification
  try {
    console.log('Test 2: LID/Phone Unification Logic');
    let savedData = null;
    MemberRepository.save = async (groupId, data) => {
      savedData = data;
      return data;
    };

    const lidUserId = '123456789@lid';
    // Expectation: Extracts phone 123456789 from LID
    
    await MemberService.getOrCreateUnified('123@g.us', lidUserId, mocks.sock);

    assert.equal(savedData.phone, '123456789', 'Should extract phone from LID');
    assert.equal(savedData.lid, '123456789@lid', 'Should preserve LID');
    
    console.log('✅ Passed');
  } catch (e) {
    console.error('❌ Failed:', e);
  }

  console.log('🏁 Tests Completed');
}

runTests().catch(console.error);
