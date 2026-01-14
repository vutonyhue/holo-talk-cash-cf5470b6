#!/usr/bin/env node

/**
 * FunChat API Gateway - Interactive Setup Script
 * 
 * This script automates the setup process for the Cloudflare Worker:
 * 1. Checks prerequisites (Node.js, Wrangler)
 * 2. Prompts for Supabase credentials
 * 3. Creates KV namespaces
 * 4. Updates wrangler.toml with KV IDs
 * 5. Sets secrets
 * 6. Deploys the worker
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  wranglerToml: path.join(__dirname, '..', 'wrangler.toml'),
  supabaseUrl: 'https://dgeadmmbkvcsgizsnbpi.supabase.co',
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

function warn(message) {
  log(`⚠ ${message}`, 'yellow');
}

function header(message) {
  console.log();
  log('═'.repeat(60), 'cyan');
  log(`  ${message}`, 'cyan');
  log('═'.repeat(60), 'cyan');
  console.log();
}

function step(num, message) {
  log(`\n[${num}] ${message}`, 'yellow');
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

async function prompt(question, isPassword = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (isPassword) {
      process.stdout.write(question);
      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      let password = '';
      stdin.on('data', (char) => {
        char = char.toString();
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004':
            stdin.setRawMode(false);
            stdin.pause();
            console.log();
            rl.close();
            resolve(password);
            break;
          case '\u0003':
            process.exit();
            break;
          case '\u007F':
            password = password.slice(0, -1);
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(question + '*'.repeat(password.length));
            break;
          default:
            password += char;
            process.stdout.write('*');
            break;
        }
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

async function confirm(question) {
  const answer = await prompt(`${question} (y/N): `);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

// ============================================================================
// Setup Functions
// ============================================================================

function checkPrerequisites() {
  step(1, 'Checking prerequisites...');

  // Check Node.js
  try {
    const nodeVersion = execCommand('node --version', { silent: true }).trim();
    success(`Node.js ${nodeVersion}`);
  } catch {
    error('Node.js is not installed');
    info('Please install Node.js from https://nodejs.org/');
    process.exit(1);
  }

  // Check Wrangler
  try {
    const wranglerVersion = execCommand('wrangler --version', { silent: true }).trim();
    success(`Wrangler ${wranglerVersion}`);
  } catch {
    warn('Wrangler CLI is not installed globally');
    info('Installing wrangler locally...');
    execCommand('npm install wrangler -D');
    success('Wrangler installed');
  }

  // Check if logged in to Cloudflare
  try {
    execCommand('wrangler whoami', { silent: true });
    success('Authenticated with Cloudflare');
  } catch {
    warn('Not logged in to Cloudflare');
    info('Please login to Cloudflare...');
    execCommand('wrangler login');
    success('Logged in to Cloudflare');
  }
}

async function getSupabaseCredentials() {
  step(2, 'Supabase Configuration');

  info(`Supabase URL: ${CONFIG.supabaseUrl}`);

  let serviceKey = await prompt('Enter Supabase Service Role Key: ', true);

  // Validate service key format
  if (!serviceKey.startsWith('eyJ')) {
    error('Invalid service role key format');
    process.exit(1);
  }

  success('Credentials validated');

  return {
    url: CONFIG.supabaseUrl,
    serviceKey,
  };
}

function createKVNamespaces() {
  step(3, 'Creating KV Namespaces...');

  let apiKeyCacheId = null;
  let rateLimitId = null;

  // Create API_KEY_CACHE namespace
  try {
    const output = execCommand('wrangler kv:namespace create API_KEY_CACHE', { silent: true });
    const match = output.match(/id = "([^"]+)"/);
    if (match) {
      apiKeyCacheId = match[1];
      success(`API_KEY_CACHE created (id: ${apiKeyCacheId})`);
    }
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      warn('API_KEY_CACHE namespace already exists');
      // Try to get existing ID
      try {
        const list = execCommand('wrangler kv:namespace list', { silent: true });
        const namespaces = JSON.parse(list);
        const existing = namespaces.find(ns => ns.title.includes('API_KEY_CACHE'));
        if (existing) {
          apiKeyCacheId = existing.id;
          info(`Using existing namespace: ${apiKeyCacheId}`);
        }
      } catch {
        error('Could not find existing namespace ID');
      }
    } else {
      throw err;
    }
  }

  // Create RATE_LIMIT namespace
  try {
    const output = execCommand('wrangler kv:namespace create RATE_LIMIT', { silent: true });
    const match = output.match(/id = "([^"]+)"/);
    if (match) {
      rateLimitId = match[1];
      success(`RATE_LIMIT created (id: ${rateLimitId})`);
    }
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      warn('RATE_LIMIT namespace already exists');
      try {
        const list = execCommand('wrangler kv:namespace list', { silent: true });
        const namespaces = JSON.parse(list);
        const existing = namespaces.find(ns => ns.title.includes('RATE_LIMIT'));
        if (existing) {
          rateLimitId = existing.id;
          info(`Using existing namespace: ${rateLimitId}`);
        }
      } catch {
        error('Could not find existing namespace ID');
      }
    } else {
      throw err;
    }
  }

  return { apiKeyCacheId, rateLimitId };
}

function updateWranglerToml(kvIds) {
  step(4, 'Updating wrangler.toml...');

  let content = fs.readFileSync(CONFIG.wranglerToml, 'utf-8');

  if (kvIds.apiKeyCacheId) {
    content = content.replace(
      '__API_KEY_CACHE_ID__',
      kvIds.apiKeyCacheId
    );
    content = content.replace(
      '__API_KEY_CACHE_PROD_ID__',
      kvIds.apiKeyCacheId
    );
  }

  if (kvIds.rateLimitId) {
    content = content.replace(
      '__RATE_LIMIT_ID__',
      kvIds.rateLimitId
    );
    content = content.replace(
      '__RATE_LIMIT_PROD_ID__',
      kvIds.rateLimitId
    );
  }

  fs.writeFileSync(CONFIG.wranglerToml, content);
  success('wrangler.toml updated');
}

function setSecrets(credentials) {
  step(5, 'Setting secrets...');

  // Set SUPABASE_URL
  try {
    execCommand(`echo "${credentials.url}" | wrangler secret put SUPABASE_URL`, { silent: true });
    success('SUPABASE_URL set');
  } catch (err) {
    error('Failed to set SUPABASE_URL');
    console.error(err.message);
  }

  // Set SUPABASE_SERVICE_KEY
  try {
    execCommand(`echo "${credentials.serviceKey}" | wrangler secret put SUPABASE_SERVICE_KEY`, { silent: true });
    success('SUPABASE_SERVICE_KEY set');
  } catch (err) {
    error('Failed to set SUPABASE_SERVICE_KEY');
    console.error(err.message);
  }
}

async function deployWorker() {
  step(6, 'Deploying worker...');

  const shouldDeploy = await confirm('Deploy worker now?');

  if (shouldDeploy) {
    try {
      const output = execCommand('wrangler deploy', { silent: true });
      const urlMatch = output.match(/https:\/\/[^\s]+\.workers\.dev/);
      const workerUrl = urlMatch ? urlMatch[0] : 'Unable to determine URL';
      success(`Deployed to ${workerUrl}`);
      return workerUrl;
    } catch (err) {
      error('Deployment failed');
      console.error(err.message);
      return null;
    }
  } else {
    info('Skipping deployment. Run `npm run deploy` when ready.');
    return null;
  }
}

function showCompletionMessage(workerUrl) {
  header('Setup Complete!');

  if (workerUrl) {
    log(`Your API Gateway URL: ${workerUrl}`, 'green');
    console.log();
    log('Update your FunChat SDK to use this URL:', 'dim');
    console.log();
    log(`  const client = new FunChatClient({`, 'dim');
    log(`    apiKey: 'fc_live_xxx',`, 'dim');
    log(`    baseUrl: '${workerUrl}'`, 'dim');
    log(`  });`, 'dim');
  }

  console.log();
  log('Available commands:', 'yellow');
  log('  npm run dev      - Start development server', 'dim');
  log('  npm run deploy   - Deploy to Cloudflare', 'dim');
  log('  npm run logs     - View live logs', 'dim');
  log('  npm run test     - Test API endpoints', 'dim');
  console.log();
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  header('FunChat API Gateway Setup');

  try {
    // Step 1: Check prerequisites
    checkPrerequisites();

    // Step 2: Get Supabase credentials
    const credentials = await getSupabaseCredentials();

    // Step 3: Create KV namespaces
    const kvIds = createKVNamespaces();

    // Step 4: Update wrangler.toml
    if (kvIds.apiKeyCacheId && kvIds.rateLimitId) {
      updateWranglerToml(kvIds);
    } else {
      warn('Could not update wrangler.toml - please update KV IDs manually');
    }

    // Step 5: Set secrets
    setSecrets(credentials);

    // Step 6: Deploy
    const workerUrl = await deployWorker();

    // Show completion message
    showCompletionMessage(workerUrl);

  } catch (err) {
    error('Setup failed');
    console.error(err);
    process.exit(1);
  }
}

main();
