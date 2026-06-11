# Smoke test do Google Drive

Este smoke test valida o fluxo principal do SID3 contra uma conta real do Google Drive:

- registrar ou autenticar um usuário de teste
- conectar ou reaproveitar uma integração Google Drive
- criar projeto, API key e bucket
- fazer upload, listagem, download e exclusão de um arquivo
- validar logs de operação
- revogar a API key criada no teste

## Pré-requisitos

- PostgreSQL em execução
- API disponível em `SID3_API_BASE_URL` ou `http://localhost:3000/api/v1`
- `api/.env` com credenciais OAuth válidas
- `GOOGLE_OAUTH_REDIRECT_URI` registrado no OAuth Client
- `TOKEN_ENCRYPTION_KEY` configurada com uma chave base64 de 32 bytes

## Subir dependências e API

Em terminais separados:

```bash
docker compose -f api/docker-compose.yml up -d postgres
cd api && pnpm prisma:generate
cd api && pnpm prisma:migrate
cd api && pnpm start:dev
```

## Rodar o smoke test

```bash
SID3_API_BASE_URL=http://localhost:3000/api/v1 node scripts/smoke-google-drive.mjs
```

Quando o script pedir, abra a URL de autorização no navegador, conclua o consentimento e cole a URL final de callback.

## Variáveis opcionais

```bash
SID3_SMOKE_EMAIL=sid3-smoke@example.com
SID3_SMOKE_PASSWORD=replace-with-local-smoke-password
SID3_SMOKE_PROJECT_NAME="SID3 Smoke"
SID3_SMOKE_BUCKET_NAME=sid3-smoke
SID3_SMOKE_OBJECT_KEY=smoke/hello.txt
SID3_GOOGLE_OAUTH_CALLBACK_URL="http://localhost:4200/connections/google/callback?code=...&state=..."
```

## Resultado esperado

Ao final, o script imprime:

```text
Google Drive smoke test passed
```

O objeto enviado é apagado durante o teste. A integração Google não é revogada automaticamente, então a mesma conta pode ser reutilizada em execuções futuras.
