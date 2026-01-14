#!/usr/bin/env node

/**
 * FunChat API Gateway - Clear KV Cache Script
 * 
 * Clears all cached API keys from the KV namespace
 */

const { execSync } = require('child_process');
const readline = require('readline');

// ============================================================================
// Utilities
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
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

function warn(message) {
  log(`⚠ ${message}`, 'yellow');
}

async function confirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

function execCommand(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options,
    });
  } catch (err) {
    if (options.throwOnError !== false) {
      throw err;
    }
    return null;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log();
  log('FunChat API Gateway - Clear Cache', 'blue');
  console.log();

  warn('This will delete all cached API keys from the KV namespace.');
  warn('Users may experience a slight delay on their next API call.');
  console.log();

  const shouldClear = await confirm('Continue?');

  if (!shouldClear) {
    info('Cancelled');
    process.exit(0);
  }

  console.log();
  info('Fetching cached keys...');

  try {
    // List all keys in API_KEY_CACHE
    const keysJson = execCommand('wrangler kv:key list --binding API_KEY_CACHE', { silent: true });
    const keys = JSON.parse(keysJson);

    if (!keys || keys.length === 0) {
      info('Cache is already empty');
      process.exit(0);
    }

    info(`Found ${keys.length} cached key(s)`);

    // Delete each key
    let deleted = 0;
    for (const key of keys) {
      try {
        execCommand(`wrangler kv:key delete --binding API_KEY_CACHE "${key.name}"`, { silent: true });
        deleted++;
        log(`  Deleted: ${key.name}`, 'dim');
      } catch (err) {
        error(`  Failed to delete: ${key.name}`);
      }
    }

    console.log();
    success(`Cleared ${deleted}/${keys.length} cached key(s)`);

  } catch (err) {
    error(`Failed to clear cache: ${err.message}`);
    process.exit(1);
  }
}

main();
