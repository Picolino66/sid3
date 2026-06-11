# Setup local do SID3

Este guia cobre o fluxo real do repositório atual para rodar API, dashboard e validações locais sem depender de um workspace `pnpm` na raiz.

## Pré-requisitos

- Node.js 24+
- pnpm 10.27+
- Docker com Docker Compose
- Conta no Google Cloud com OAuth Client, se quiser validar integração real com Google Drive

Confira as versões:

```bash
node -v
pnpm -v
docker --version
```

## Estrutura relevante

- `api/`: backend NestJS, Prisma e Docker Compose do PostgreSQL
- `dashboard/`: frontend Angular
- `docs/`: documentação técnica e operacional
- `scripts/`: utilitários como secret scan e smoke test

## Instalar dependências

Instale cada pacote separadamente:

```bash
cd api && pnpm install
cd ../dashboard && pnpm install
```

## Subir PostgreSQL

O `docker-compose.yml` do banco está em `api/`:

```bash
docker compose -f api/docker-compose.yml up -d postgres
```

O serviço Redis está definido como opcional:

```bash
docker compose -f api/docker-compose.yml --profile optional up -d redis
```

## Configurar ambiente da API

Crie o arquivo local de ambiente:

```bash
cp api/.env.example api/.env
```

Valores mínimos:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://sid3:sid3@localhost:5432/sid3?schema=public
JWT_SECRET=cole-aqui-um-segredo
TOKEN_ENCRYPTION_KEY=cole-aqui-uma-chave-base64-de-32-bytes
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4200/connections/google/callback
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.file
```

Gerar segredos locais:

```bash
openssl rand -base64 32
openssl rand -base64 32
```

Use o primeiro valor para `JWT_SECRET` e o segundo para `TOKEN_ENCRYPTION_KEY`.

## Configurar Google OAuth local

Necessário apenas para integração real com Google Drive.

No Google Cloud Console:

1. Crie ou selecione um projeto.
2. Configure a tela de consentimento OAuth.
3. Crie uma credencial OAuth Client do tipo Web application.
4. Registre o redirect URI:

```text
http://localhost:4200/connections/google/callback
```

Depois preencha em `api/.env`:

```env
GOOGLE_OAUTH_CLIENT_ID=seu-client-id
GOOGLE_OAUTH_CLIENT_SECRET=seu-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4200/connections/google/callback
```

Se você baixar o JSON do OAuth Client, mantenha-o fora da raiz versionável. O caminho local adotado neste repositório é:

```text
secrets/google-oauth-client.json
```

Essa pasta é ignorada pelo Git.

## Ativar Google Drive API

No mesmo projeto do OAuth Client:

1. Abra `APIs & Services` > `Library`.
2. Procure por `Google Drive API`.
3. Abra o serviço.
4. Clique em `Enable`.

## Preparar Prisma

Com o PostgreSQL ativo:

```bash
cd api
pnpm prisma:generate
pnpm prisma:migrate
```

## Rodar a API

```bash
cd api
pnpm start:dev
```

Endpoints locais:

- API: `http://localhost:3000/api/v1`
- Health: `http://localhost:3000/api/v1/health`
- Swagger: `http://localhost:3000/docs`

## Rodar o dashboard

Em outro terminal:

```bash
cd dashboard
pnpm start
```

Dashboard local:

- `http://localhost:4200`

## Fluxo manual recomendado

1. Acesse `http://localhost:4200`.
2. Crie uma conta.
3. Faça login.
4. Crie um projeto.
5. Conecte uma conta Google Drive em `Connections`.
6. Crie API key e bucket.
7. Use a tela de arquivos para upload, download e exclusão.

## Validações locais

API:

```bash
cd api
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
```

Dashboard:

```bash
cd dashboard
pnpm typecheck
pnpm build
```

Secret scan:

```bash
node scripts/secret-scan.mjs
```

## Smoke test com Google Drive

Com a API em execução e `api/.env` preenchido:

```bash
SID3_API_BASE_URL=http://localhost:3000/api/v1 node scripts/smoke-google-drive.mjs
```

Consulte também [google-drive-smoke-test.md](./google-drive-smoke-test.md).
