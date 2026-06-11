import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../dashboard/.env');
const outputPath = resolve(__dirname, '../dashboard/public/runtime-config.js');
const defaultApiBaseUrl = 'http://localhost:3000/api/v1';
const envFile = loadEnvFile(envPath);
const apiBaseUrl = normalizeApiBaseUrl(
  process.env.SID3_API_BASE_URL ?? envFile.SID3_API_BASE_URL ?? defaultApiBaseUrl
);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `window.__SID3_RUNTIME_CONFIG__ = ${JSON.stringify({ apiBaseUrl }, null, 2)};\n`,
  'utf8'
);

console.log(`Dashboard runtime config written to ${outputPath}`);
console.log(`SID3_API_BASE_URL=${apiBaseUrl}`);

function normalizeApiBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        const key = line.slice(0, separatorIndex).trim();
        const rawValue = line.slice(separatorIndex + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, '');
        return [key, value];
      })
  );
}
