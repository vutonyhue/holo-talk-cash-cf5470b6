#!/usr/bin/env node

/**
 * FunChat API Gateway - Test Script
 * 
 * Tests various API endpoints and scenarios
 */

const https = require('https');
const http = require('http');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Update this to your worker URL after deployment
  baseUrl: process.env.WORKER_URL || 'http://localhost:8787',
  apiKey: process.env.TEST_API_KEY || '',
};

// ============================================================================
// Utilities
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function info(message) {
  log(`ℹ ${message}`, 'blue');
}

function header(message) {
  console.log();
  log('─'.repeat(50), 'cyan');
  log(`  ${message}`, 'cyan');
  log('─'.repeat(50), 'cyan');
}

async function makeRequest(path, options = {}) {
  const url = new URL(path, CONFIG.baseUrl);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const requestOptions = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };

  return new Promise((resolve, reject) => {
    const req = lib.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data),
          });
        } catch {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// ============================================================================
// Tests
// ============================================================================

async function testHealthCheck() {
  header('Test 1: Health Check');

  try {
    const response = await makeRequest('/health');

    if (response.status === 200 && response.body.success) {
      success(`Health check passed (status: ${response.status})`);
      log(`  Response: ${JSON.stringify(response.body.data)}`, 'dim');
      return true;
    } else {
      error(`Unexpected response: ${response.status}`);
      return false;
    }
  } catch (err) {
    error(`Request failed: ${err.message}`);
    return false;
  }
}

async function testMissingApiKey() {
  header('Test 2: Missing API Key (expect 401)');

  try {
    const response = await makeRequest('/api-chat/conversations');

    if (response.status === 401) {
      success(`Correctly rejected with 401`);
      log(`  Error: ${response.body.error?.message}`, 'dim');
      return true;
    } else {
      error(`Expected 401, got ${response.status}`);
      return false;
    }
  } catch (err) {
    error(`Request failed: ${err.message}`);
    return false;
  }
}

async function testInvalidApiKey() {
  header('Test 3: Invalid API Key (expect 401)');

  try {
    const response = await makeRequest('/api-chat/conversations', {
      headers: {
        'x-funchat-api-key': 'fc_live_invalid_key_12345',
      },
    });

    if (response.status === 401) {
      success(`Correctly rejected with 401`);
      log(`  Error: ${response.body.error?.message}`, 'dim');
      return true;
    } else {
      error(`Expected 401, got ${response.status}`);
      return false;
    }
  } catch (err) {
    error(`Request failed: ${err.message}`);
    return false;
  }
}

async function testCorsPreflightRequest() {
  header('Test 4: CORS Preflight Request');

  try {
    const response = await makeRequest('/api-chat/conversations', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'x-funchat-api-key',
      },
    });

    if (response.status === 204) {
      success(`CORS preflight passed (status: 204)`);
      log(`  Access-Control-Allow-Methods: ${response.headers['access-control-allow-methods']}`, 'dim');
      log(`  Access-Control-Allow-Headers: ${response.headers['access-control-allow-headers']}`, 'dim');
      return true;
    } else {
      error(`Expected 204, got ${response.status}`);
      return false;
    }
  } catch (err) {
    error(`Request failed: ${err.message}`);
    return false;
  }
}

async function testValidApiKey() {
  header('Test 5: Valid API Key');

  if (!CONFIG.apiKey) {
    info('Skipped - No TEST_API_KEY provided');
    info('Set TEST_API_KEY environment variable to test with a valid key');
    return null;
  }

  try {
    const response = await makeRequest('/api-chat/conversations', {
      headers: {
        'x-funchat-api-key': CONFIG.apiKey,
      },
    });

    log(`  Status: ${response.status}`, 'dim');
    log(`  Rate Limit: ${response.headers['x-ratelimit-limit']}`, 'dim');
    log(`  Remaining: ${response.headers['x-ratelimit-remaining']}`, 'dim');

    if (response.status === 200 || response.status === 404) {
      success(`API key accepted`);
      return true;
    } else if (response.status === 403) {
      error(`API key rejected: ${response.body.error?.message}`);
      return false;
    } else {
      info(`Received status ${response.status}`);
      return true;
    }
  } catch (err) {
    error(`Request failed: ${err.message}`);
    return false;
  }
}

async function testRateLimitHeaders() {
  header('Test 6: Rate Limit Headers');

  if (!CONFIG.apiKey) {
    info('Skipped - No TEST_API_KEY provided');
    return null;
  }

  try {
    const response = await makeRequest('/api-users/me', {
      headers: {
        'x-funchat-api-key': CONFIG.apiKey,
      },
    });

    const hasRateLimitHeaders =
      response.headers['x-ratelimit-limit'] &&
      response.headers['x-ratelimit-remaining'] &&
      response.headers['x-ratelimit-reset'];

    if (hasRateLimitHeaders) {
      success('Rate limit headers present');
      log(`  X-RateLimit-Limit: ${response.headers['x-ratelimit-limit']}`, 'dim');
      log(`  X-RateLimit-Remaining: ${response.headers['x-ratelimit-remaining']}`, 'dim');
      log(`  X-RateLimit-Reset: ${response.headers['x-ratelimit-reset']}`, 'dim');
      return true;
    } else {
      error('Rate limit headers missing');
      return false;
    }
  } catch (err) {
    error(`Request failed: ${err.message}`);
    return false;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log();
  log('═'.repeat(50), 'cyan');
  log('  FunChat API Gateway - Test Suite', 'cyan');
  log('═'.repeat(50), 'cyan');
  log(`  Target: ${CONFIG.baseUrl}`, 'dim');
  log(`  API Key: ${CONFIG.apiKey ? '***' + CONFIG.apiKey.slice(-4) : 'Not provided'}`, 'dim');

  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
  };

  const tests = [
    testHealthCheck,
    testMissingApiKey,
    testInvalidApiKey,
    testCorsPreflightRequest,
    testValidApiKey,
    testRateLimitHeaders,
  ];

  for (const test of tests) {
    const result = await test();
    if (result === true) results.passed++;
    else if (result === false) results.failed++;
    else results.skipped++;
  }

  // Summary
  console.log();
  log('═'.repeat(50), 'cyan');
  log('  Summary', 'cyan');
  log('═'.repeat(50), 'cyan');
  log(`  Passed:  ${results.passed}`, 'green');
  log(`  Failed:  ${results.failed}`, results.failed > 0 ? 'red' : 'dim');
  log(`  Skipped: ${results.skipped}`, 'dim');
  console.log();

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  error(`Test suite failed: ${err.message}`);
  process.exit(1);
});
