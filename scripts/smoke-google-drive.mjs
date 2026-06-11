import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const apiBaseUrl = process.env.SID3_API_BASE_URL ?? 'http://localhost:3000/api/v1';
const runId = Date.now().toString(36);
const email = process.env.SID3_SMOKE_EMAIL ?? `sid3-smoke-${runId}@example.com`;
const password = process.env.SID3_SMOKE_PASSWORD ?? `sid3-smoke-password-${runId}`;
const projectName = process.env.SID3_SMOKE_PROJECT_NAME ?? `SID3 Smoke ${runId}`;
const bucketName = process.env.SID3_SMOKE_BUCKET_NAME ?? `smoke-${runId}`;
const objectKey = process.env.SID3_SMOKE_OBJECT_KEY ?? `smoke/${runId}/hello.txt`;
const objectBody = `SID3 Google Drive smoke test ${runId}\n`;

let accessToken = '';
let apiKeySecret = '';
let createdApiKeyId = '';
let createdProjectId = '';
let createdBucketId = '';
let createdObjectId = '';

await main();

async function main() {
  console.log(`SID3 Google Drive smoke test against ${apiBaseUrl}`);

  await request('/health');
  await authenticate();
  const integration = await ensureGoogleIntegration();
  await createProject();
  await createApiKey();
  await createBucket(integration.id);
  await uploadObject();
  await listObjects();
  await downloadObject();
  await deleteObject();
  await listLogs();
  await cleanupApiKey();

  console.log('Google Drive smoke test passed');
}

async function authenticate() {
  const requestBody = {
    email,
    password,
    name: 'SID3 Smoke'
  };

  try {
    const response = await request('/auth/register', {
      method: 'POST',
      json: requestBody
    });
    accessToken = response.accessToken;
    console.log(`Registered smoke user ${email}`);
    return;
  } catch (error) {
    if (!String(error).includes('409')) {
      throw error;
    }
  }

  const response = await request('/auth/login', {
    method: 'POST',
    json: {
      email,
      password
    }
  });
  accessToken = response.accessToken;
  console.log(`Logged in smoke user ${email}`);
}

async function ensureGoogleIntegration() {
  const integrations = await request('/integrations', {
    headers: bearerHeaders()
  });
  const connectedIntegration = integrations.find(
    (integration) => integration.provider === 'GOOGLE_DRIVE' && integration.status === 'CONNECTED'
  );

  if (connectedIntegration) {
    console.log(`Using existing Google Drive integration ${connectedIntegration.id}`);
    return connectedIntegration;
  }

  const authorization = await request('/integrations/google/authorize', {
    method: 'POST',
    headers: bearerHeaders()
  });

  console.log('Open this authorization URL in a browser, finish Google consent, then paste the full redirect URL here:');
  console.log(authorization.authorizationUrl);

  const callbackUrl = process.env.SID3_GOOGLE_OAUTH_CALLBACK_URL ?? (await promptCallbackUrl());
  const callback = parseOAuthCallback(callbackUrl);
  const integration = await request('/integrations/google/callback', {
    method: 'POST',
    headers: bearerHeaders(),
    json: callback
  });

  console.log(`Connected Google Drive integration ${integration.id}`);
  return integration;
}

async function createProject() {
  const project = await request('/projects', {
    method: 'POST',
    headers: bearerHeaders(),
    json: {
      name: projectName
    }
  });
  createdProjectId = project.id;
  console.log(`Created project ${project.id}`);
}

async function createApiKey() {
  const response = await request(`/projects/${createdProjectId}/api-keys`, {
    method: 'POST',
    headers: bearerHeaders(),
    json: {
      name: `Smoke ${runId}`
    }
  });
  createdApiKeyId = response.apiKey.id;
  apiKeySecret = response.secret;
  console.log(`Created API key ${createdApiKeyId}`);
}

async function createBucket(providerIntegrationId) {
  const bucket = await request(`/projects/${createdProjectId}/buckets`, {
    method: 'POST',
    headers: bearerHeaders(),
    json: {
      name: bucketName,
      providerIntegrationId
    }
  });
  createdBucketId = bucket.id;
  console.log(`Created bucket ${createdBucketId}`);
}

async function uploadObject() {
  const body = new FormData();
  body.append('key', objectKey);
  body.append('file', new Blob([objectBody], { type: 'text/plain' }), 'hello.txt');

  const object = await request(`/buckets/${createdBucketId}/objects`, {
    method: 'POST',
    headers: apiKeyHeaders(),
    body
  });
  createdObjectId = object.id;
  console.log(`Uploaded object ${createdObjectId}`);
}

async function listObjects() {
  const response = await request(`/buckets/${createdBucketId}/objects?prefix=${encodeURIComponent(objectKey)}`, {
    headers: apiKeyHeaders()
  });

  if (!response.items.some((object) => object.id === createdObjectId)) {
    throw new Error('Uploaded object was not returned by list operation');
  }

  console.log('Listed uploaded object');
}

async function downloadObject() {
  const response = await fetch(`${apiBaseUrl}/buckets/${createdBucketId}/objects/${createdObjectId}/download`, {
    headers: apiKeyHeaders()
  });

  if (!response.ok) {
    throw new Error(`Download failed with ${response.status}: ${await response.text()}`);
  }

  const downloadedBody = await response.text();
  if (downloadedBody !== objectBody) {
    throw new Error('Downloaded object content did not match uploaded content');
  }

  console.log('Downloaded object content matches upload');
}

async function deleteObject() {
  await request(`/buckets/${createdBucketId}/objects/${createdObjectId}`, {
    method: 'DELETE',
    headers: apiKeyHeaders()
  });
  console.log('Deleted object');
}

async function listLogs() {
  const logs = await request(`/projects/${createdProjectId}/logs?limit=20`, {
    headers: bearerHeaders()
  });
  const operations = new Set(logs.map((log) => log.operation));

  for (const operation of ['UPLOAD', 'LIST', 'DOWNLOAD', 'DELETE']) {
    if (!operations.has(operation)) {
      throw new Error(`Missing ${operation} operation log`);
    }
  }

  console.log('Verified operation logs');
}

async function cleanupApiKey() {
  if (!createdApiKeyId) {
    return;
  }

  await request(`/projects/${createdProjectId}/api-keys/${createdApiKeyId}`, {
    method: 'DELETE',
    headers: bearerHeaders()
  });
  console.log('Revoked smoke API key');
}

async function request(path, options = {}) {
  const headers = {
    ...(options.headers ?? {})
  };
  const requestOptions = {
    method: options.method ?? 'GET',
    headers
  };

  if (options.json) {
    requestOptions.body = JSON.stringify(options.json);
    headers['Content-Type'] = 'application/json';
  }

  if (options.body) {
    requestOptions.body = options.body;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, requestOptions);

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${await response.text()}`);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

async function promptCallbackUrl() {
  if (!input.isTTY) {
    throw new Error('Set SID3_GOOGLE_OAUTH_CALLBACK_URL or run this script in an interactive terminal');
  }

  const readline = createInterface({ input, output });
  try {
    return await readline.question('Google OAuth callback URL: ');
  } finally {
    readline.close();
  }
}

function parseOAuthCallback(callbackUrl) {
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    throw new Error('Callback URL must contain code and state query parameters');
  }

  return { code, state };
}

function bearerHeaders() {
  return {
    Authorization: `Bearer ${accessToken}`
  };
}

function apiKeyHeaders() {
  return {
    'X-SID3-API-Key': apiKeySecret
  };
}
