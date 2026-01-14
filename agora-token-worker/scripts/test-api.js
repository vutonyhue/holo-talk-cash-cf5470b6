#!/usr/bin/env node

/**
 * Test script for Agora Token Worker API
 * 
 * Usage:
 *   node scripts/test-api.js [worker-url]
 * 
 * Examples:
 *   node scripts/test-api.js                                    # Test local dev
 *   node scripts/test-api.js https://agora-token-worker.xxx.workers.dev
 */

const WORKER_URL = process.argv[2] || 'http://localhost:8787';

async function testHealthCheck() {
  console.log('\n📋 Testing Health Check (GET /)...');
  
  try {
    const response = await fetch(WORKER_URL);
    const data = await response.json();
    
    if (response.ok && data.status === 'ok') {
      console.log('✅ Health check passed:', data);
      return true;
    } else {
      console.log('❌ Health check failed:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    return false;
  }
}

async function testTokenGeneration() {
  console.log('\n🔑 Testing Token Generation (POST /)...');
  
  const testPayload = {
    channel: 'test-channel-' + Date.now(),
    uid: Math.floor(Math.random() * 100000),
    role: 'publisher',
    expireTime: 3600
  };
  
  console.log('   Request:', testPayload);
  
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });
    
    const data = await response.json();
    
    if (response.ok && data.token) {
      console.log('✅ Token generation passed!');
      console.log('   Response:', {
        appId: data.appId,
        channel: data.channel,
        uid: data.uid,
        expireTime: data.expireTime,
        tokenLength: data.token.length,
        tokenPrefix: data.token.substring(0, 20) + '...'
      });
      return true;
    } else {
      console.log('❌ Token generation failed:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Token generation error:', error.message);
    return false;
  }
}

async function testValidation() {
  console.log('\n🔍 Testing Validation...');
  
  // Test missing channel
  console.log('\n   Testing missing channel...');
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 12345 }),
    });
    const data = await response.json();
    
    if (response.status === 400 && data.error.includes('channel')) {
      console.log('   ✅ Correctly rejected missing channel');
    } else {
      console.log('   ❌ Should reject missing channel:', data);
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  
  // Test missing uid
  console.log('\n   Testing missing uid...');
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'test' }),
    });
    const data = await response.json();
    
    if (response.status === 400 && data.error.includes('uid')) {
      console.log('   ✅ Correctly rejected missing uid');
    } else {
      console.log('   ❌ Should reject missing uid:', data);
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  
  return true;
}

async function runTests() {
  console.log('🚀 Agora Token Worker API Test Suite');
  console.log('=====================================');
  console.log(`Target URL: ${WORKER_URL}`);
  
  const results = {
    healthCheck: await testHealthCheck(),
    tokenGeneration: await testTokenGeneration(),
    validation: await testValidation(),
  };
  
  console.log('\n=====================================');
  console.log('📊 Test Results Summary:');
  console.log('   Health Check:', results.healthCheck ? '✅ PASS' : '❌ FAIL');
  console.log('   Token Generation:', results.tokenGeneration ? '✅ PASS' : '❌ FAIL');
  console.log('   Validation:', results.validation ? '✅ PASS' : '❌ FAIL');
  
  const allPassed = Object.values(results).every(r => r);
  console.log('\n' + (allPassed ? '✅ All tests passed!' : '❌ Some tests failed'));
  
  process.exit(allPassed ? 0 : 1);
}

runTests();
