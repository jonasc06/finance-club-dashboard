const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const client = new SecretManagerServiceClient();
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';

// Cache fetched secrets so we only call the API once per process lifetime
const cache = {};

async function getSecret(name) {
  // In development, just use .env
  if (process.env.NODE_ENV !== 'production') {
    return process.env[name] || '';
  }

  // Return cached value if we already fetched it
  if (cache[name] !== undefined) {
    return cache[name];
  }

  try {
    const secretName = `projects/${PROJECT_ID}/secrets/${name}/versions/latest`;
    const [version] = await client.accessSecretVersion({ name: secretName });
    const value = version.payload.data.toString('utf8');
    cache[name] = value;
    return value;
  } catch (err) {
    console.error(`[Secrets] Failed to fetch "${name}":`, err.message);
    // Fall back to env var if secret fetch fails
    return process.env[name] || '';
  }
}

// Fetch ALL secrets at once during startup, then store them in process.env
// so the rest of the app can use config/index.js as before
async function loadAllSecrets() {
  const secretNames = [
    'APIFY_TOKEN',
    'SESSION_SECRET',
    'DASHBOARD_PASSWORD',
    'MARKETING_PASSWORD',
    'LINKEDIN_COMPANY_URL',
    'INSTAGRAM_USERNAME',
    'CRON_SECRET',
    'EASYVEREIN_SECRET',
  ];

  console.log('[Secrets] Loading secrets...');

  await Promise.all(secretNames.map(async (name) => {
    const value = await getSecret(name);
    if (value) {
      process.env[name] = value;
    }
  }));

  console.log('[Secrets] All secrets loaded.');
}

async function updateSecret(name, value) {
  // In development: just update the in-memory env var
  if (process.env.NODE_ENV !== 'production') {
    process.env[name] = value;
    cache[name] = value;
    return;
  }
  try {
    await client.addSecretVersion({
      parent: `projects/${PROJECT_ID}/secrets/${name}`,
      payload: { data: Buffer.from(value, 'utf8') },
    });
    // Update in-memory cache so this process uses the new value immediately
    cache[name] = value;
    process.env[name] = value;
    console.log(`[Secrets] Updated "${name}" in Secret Manager`);
  } catch (err) {
    console.error(`[Secrets] Failed to update "${name}":`, err.message);
  }
}

module.exports = { getSecret, updateSecret, loadAllSecrets };
