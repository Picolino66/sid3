# CLAUDE.md

## Projeto

SID3 — SInsideDrive3, gateway de armazenamento em nuvem usando Google Drive como backend de storage.

### Objetivo

Fornecer uma API unificada para:

- armazenar e recuperar arquivos via Google Drive
- gerenciar projetos e buckets virtuais
- controlar acesso por API keys
- conectar múltiplas contas Google Drive (multi-drive)
- rotear uploads entre drives via storage pools
- registrar todas as operações para auditoria

### Problemas que resolve

- complexidade de integrar diretamente com a Google Drive API
- dificuldade de gerenciar múltiplos drives como um pool de storage
- falta de rastreabilidade de operações (quem fez o quê, quando)
- ausência de camada de autenticação unificada para acesso ao storage

## Classificação Arquitetural

- Tipo: `Produto SaaS`
- Complexidade: `alta`
- Criticidade: `alta`
- Banco: `PostgreSQL`
- Backend: `NestJS`
- ORM: `Prisma`
- Frontend: `Angular`

## Estrutura do Workspace

- `api`: backend NestJS (REST API + integrações Google Drive)
- `dashboard`: frontend Angular (gestão de projetos, conexões, objetos e estatísticas)
- `docs`: documentação técnica e de produto
- `scripts`: utilitários de CI (validação de contrato, secret scan, smoke tests)

## Diretrizes de Arquitetura

- Preferir `monólito modular` — módulos por domínio com fronteiras claras.
- Evitar microservices sem necessidade real.
- Aplicar `Clean Architecture leve` no backend: controller → service → use case → repository.
- Evitar overengineering. Preferir simplicidade e rastreabilidade.
- Multi-tenancy por usuário: cada usuário tem seus próprios projetos e integrações.

## Domínio Principal

- `users`: autenticação JWT e gestão de conta
- `projects`: agrupador lógico de recursos por usuário
- `api-keys`: chaves de acesso por projeto
- `connections`: integrações OAuth com Google Drive
- `buckets`: containers virtuais de storage (ligados a um drive ou pool)
- `storage-pools`: pool de múltiplos drives com estratégia de roteamento
- `objects`: arquivos armazenados (metadados + referência no drive)
- `stats`: estatísticas de uso por projeto
- `operation-logs`: auditoria de todas as operações

## Skills Obrigatórias

### `nest-api-specialist`

Usar ao trabalhar na `api` com NestJS.

Aplicar em:

- arquitetura de módulos
- controllers, services, providers
- validação, auth (JWT + API Key), Swagger
- testes unitários e de integração

### `angular-frontend-specialist`

Usar ao trabalhar no `dashboard` Angular.

Aplicar em:

- standalone components
- services HTTP e RxJS
- roteamento e navegação
- formulários reativos
- estrutura de features

### `ai-docs-self-healing`

Usar para manter `docs/` sincronizado com o código.

Aplicar quando:

- um módulo mudar de contrato ou comportamento
- uma nova feature for adicionada
- a estrutura do projeto mudar

### `task-breakdown-engine`

Usar para decompor trabalho em tarefas rastreáveis.

## Padrões

- `Repository` para persistência via Prisma
- `Use Case` para regras de aplicação
- `Guard` para autorização (JWT + API Key)
- `DTO` com class-validator para entrada e saída
- `Swagger/OpenAPI` documentado na API
- Testes para regras de negócio e fluxos críticos

## Docs First

- Consultar `docs/` antes de alterar código.
- Tratar `docs/` como fonte primária de contexto.
- Atualizar documentação sempre que mudar comportamento, contrato ou estrutura.

## Prioridades de Evolução

1. Autenticação e gestão de usuários
2. Projetos e API Keys
3. Conexões OAuth com Google Drive
4. Buckets e storage pools
5. Upload, download e listagem de objetos
6. Estatísticas e logs de operação
7. Multi-drive com roteamento por pool
8. Notificações e webhooks no futuro
