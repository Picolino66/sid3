import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../api/package.json'));
const SwaggerParser = require('@apidevtools/swagger-parser');
const apiSpecPath = resolve(__dirname, '../docs/contracts/openapi-v1.yaml');

try {
  const api = await SwaggerParser.validate(apiSpecPath);
  const pathCount = Object.keys(api.paths ?? {}).length;
  const schemaCount = Object.keys(api.components?.schemas ?? {}).length;

  console.log(`OpenAPI contract valid: ${api.info?.title ?? 'API'} ${api.info?.version ?? ''}`);
  console.log(`Validated ${pathCount} paths and ${schemaCount} schemas`);
} catch (error) {
  console.error(`OpenAPI contract validation failed for ${apiSpecPath}`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
