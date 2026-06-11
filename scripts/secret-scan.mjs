import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const rootDir = process.cwd();
const ignoredDirectories = new Set([
  '.angular',
  '.git',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'tmp'
]);
const ignoredFiles = new Set(['pnpm-lock.yaml']);
const allowedExtensions = new Set([
  '.cjs',
  '.css',
  '.env.example',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.prisma',
  '.ts',
  '.yaml',
  '.yml'
]);

const secretPatterns = [
  {
    name: 'Private key block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i
  },
  {
    name: 'Google API key',
    pattern: /AIza[0-9A-Za-z_-]{35}/
  },
  {
    name: 'GitHub token',
    pattern: /gh[pousr]_[0-9A-Za-z]{36,}/
  },
  {
    name: 'AWS access key',
    pattern: /AKIA[0-9A-Z]{16}/
  },
  {
    name: 'SID3 live API key',
    pattern: /sid3_live_[A-Za-z0-9]{12}_[A-Za-z0-9_-]{24,}/
  },
  {
    name: 'Assigned secret value',
    pattern: /\b(?:password|passwd|secret|token|api[_-]?key|client[_-]?secret)\b\s*[:=]\s*["'](?!changeme|change-me|example|placeholder|replace-me|todo|your-|<|\$\{)[A-Za-z0-9_./+=-]{16,}["']/i
  }
];

const findings = [];

scanDirectory(rootDir);

if (findings.length > 0) {
  console.error('Potential secrets found:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.pattern}`);
  }
  process.exit(1);
}

console.log('Secret scan passed');

function scanDirectory(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const relativePath = relative(rootDir, path);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      if (!ignoredDirectories.has(entry)) {
        scanDirectory(path);
      }
      continue;
    }

    if (!stats.isFile() || ignoredFiles.has(entry) || !isAllowedFile(relativePath)) {
      continue;
    }

    scanFile(path, relativePath);
  }
}

function isAllowedFile(path) {
  return [...allowedExtensions].some((extension) => path.endsWith(extension));
}

function scanFile(path, relativePath) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const secretPattern of secretPatterns) {
      if (secretPattern.pattern.test(line)) {
        findings.push({
          file: relativePath,
          line: index + 1,
          pattern: secretPattern.name
        });
      }
    }
  });
}
