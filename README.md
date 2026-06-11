# SID3

SID3, ou SInsideDrive3, é uma plataforma SaaS com API REST e dashboard web para expor armazenamento baseado em Google Drive com autenticação própria, buckets virtuais, API keys, pools de storage e trilha de auditoria.

## Visão geral

O projeto está organizado em quatro áreas principais:

- `api/`: backend NestJS com Prisma, autenticação JWT, integrações Google Drive e endpoints REST
- `dashboard/`: frontend Angular para operação do produto
- `docs/`: documentação de produto, contratos, operação e contexto arquitetural
- `scripts/`: utilitários locais de verificação e smoke test

O contexto de engenharia atual está em `docs/orchestration/context.json`.

## Pré-requisitos

- Node.js 24+
- pnpm 10.27+
- Docker com Docker Compose
- Conta Google Cloud com OAuth Client, se quiser validar integração real com Google Drive

## Setup rápido

1. Instale as dependências de cada pacote:

```bash
cd api && pnpm install
cd ../dashboard && pnpm install
```

2. Suba o PostgreSQL local:

```bash
docker compose -f api/docker-compose.yml up -d postgres
```

3. Crie o ambiente da API:

```bash
cp api/.env.example api/.env
```

4. Crie o ambiente do dashboard:

```bash
cp dashboard/.env.example dashboard/.env
```

5. Gere segredos locais para `JWT_SECRET` e `TOKEN_ENCRYPTION_KEY`:

```bash
openssl rand -base64 32
openssl rand -base64 32
```

6. Prepare o Prisma:

```bash
cd api
pnpm prisma:generate
pnpm prisma:migrate
```

7. Inicie a API:

```bash
cd api
pnpm start:dev
```

8. Em outro terminal, inicie o dashboard:

```bash
cd dashboard
pnpm start
```

Endpoints locais:

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`
- Dashboard: `http://localhost:4200`

## Configuração Google Drive

Para login OAuth e operações reais no Google Drive, você precisa preparar uma credencial no Google Cloud.

1. Crie ou selecione um projeto no Google Cloud Console.
2. Vá em `APIs & Services` > `OAuth consent screen`.
3. Configure a tela de consentimento.
4. Se o app estiver em modo de teste, adicione o seu e-mail em `Test users`.
5. Vá em `APIs & Services` > `Credentials`.
6. Crie uma credencial do tipo `OAuth client ID`.
7. Escolha `Web application`.
8. Cadastre este redirect URI:

```text
http://localhost:4200/connections/google/callback
```

9. Vá em `APIs & Services` > `Library`.
10. Procure por `Google Drive API`.
11. Abra a API e clique em `Enable`.

Sem ativar a `Google Drive API`, o login OAuth pode até concluir, mas upload, download, listagem e exclusão de arquivos no Drive não vão funcionar corretamente.

Depois disso, copie as credenciais para o ambiente local da API:

```env
GOOGLE_OAUTH_CLIENT_ID=seu-client-id
GOOGLE_OAUTH_CLIENT_SECRET=seu-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4200/connections/google/callback
GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.file
```

Se você baixar o JSON da credencial OAuth, mantenha esse arquivo apenas para uso local em:

```text
secrets/google-oauth-client.json
```

Esse arquivo não deve ser commitado.

## Segurança local

Nunca commit:

- `api/.env` ou qualquer variante local de ambiente
- arquivos exportados de credenciais OAuth
- chaves privadas, certificados e secrets temporários

O repositório adota a pasta local `secrets/` para armazenar credenciais baixadas da Google Cloud, por exemplo:

```text
secrets/google-oauth-client.json
```

Essa pasta é ignorada pelo Git, assim como `client_secret_*.json` e extensões comuns de chave/certificado.

Resumo do que precisa existir localmente para integração real com Google Drive:

- `api/.env` preenchido com `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET`
- `dashboard/.env` preenchido com `SID3_API_BASE_URL`
- `GOOGLE_OAUTH_REDIRECT_URI` apontando para `http://localhost:4200/connections/google/callback`
- `SID3_API_BASE_URL` apontando para a API que o dashboard deve consumir
- `Google Drive API` ativada no projeto do Google Cloud
- seu usuário autorizado na tela de consentimento, se a aplicação estiver em modo de teste
- credencial JSON, se você quiser guardá-la localmente, dentro de `secrets/`

## Validação local

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

Docker do dashboard:

```bash
docker build \
  --build-arg SID3_API_BASE_URL="$(grep '^SID3_API_BASE_URL=' dashboard/.env | cut -d= -f2-)" \
  -t sid3-dashboard \
  ./dashboard

docker run --rm -p 8080:80 sid3-dashboard
```

Secret scan:

```bash
node scripts/secret-scan.mjs
```

Smoke test Google Drive:

```bash
SID3_API_BASE_URL=http://localhost:3000/api/v1 node scripts/smoke-google-drive.mjs
```

## Documentação

- Setup local: `docs/operations/local-setup.md`
- Smoke test Google Drive: `docs/operations/google-drive-smoke-test.md`
- Contexto de produto e arquitetura: `docs/orchestration/README.md`
- Modelo de dados: `docs/contracts/data-model.md`
- Contrato OpenAPI: `docs/contracts/openapi-v1.yaml`
- Backlog técnico: `docs/engineering/backlog.md`
