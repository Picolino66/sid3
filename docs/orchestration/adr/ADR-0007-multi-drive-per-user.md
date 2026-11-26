# ADR-0007: Multi-Drive por Usuário

## Contexto

O modelo original de `ProviderIntegration` tinha lógica de upsert em `storeGoogleIntegration()` que impedia um usuário de conectar mais de uma conta Google Drive. O schema nunca teve uma constraint `UNIQUE(userId, provider)`, mas a camada de serviço impunha esse comportamento via `findFirst → update/create`.

A evolução do produto para tornar o SID3 uma plataforma de abstração de armazenamento (não apenas um gateway para um Drive) exige que múltiplas contas de provider possam ser conectadas por usuário.

## Opções consideradas

1. Manter 1 conta por provider por usuário, expandir para múltiplos providers futuros
2. Permitir N contas por provider por usuário, com identificação por `displayName`
3. Criar uma entidade separada `Connection` desacoplada de `ProviderIntegration`

## Decisão

**Opção 2** — N contas por provider por usuário com `displayName` opcional.

- Removida a lógica de upsert de `connections.service.ts`; toda conexão nova cria um registro distinto
- Adicionado campo `displayName: String?` em `ProviderIntegration`
- Renomeado módulo `integrations` → `connections` em toda a API e frontend
- Adicionado endpoint `PATCH /connections/:connectionId` para editar `displayName`
- (2026-11-26) `POST /connections/google/authorize` aceita `displayName` opcional: o nome fica em `oauth_states.display_name` e é aplicado à conexão criada no callback; vazio/ausente vira `GOOGLE_DRIVE`. A reautorização não altera o nome. O dashboard pede o nome num diálogo antes de redirecionar ao Google.

## Trade-offs

- **Pro:** Zero mudança de schema além de `displayName`; a relação 1:N já existia
- **Pro:** Cada Drive aparece como conexão independente, permitindo gerenciamento granular
- **Contra:** Não há constraint de unicidade por `(userId, provider, providerAccountEmail)` — usuário pode conectar o mesmo Drive duas vezes; mitigação: alertar na UI se `providerAccountEmail` já existir
- **Contra:** Revogação de um Drive não afeta os outros; comportamento esperado e correto

## Consequências

- `connections.service.ts` é a versão canônica do serviço de conexões
- `bucket.providerIntegrationId` permanece FK para `provider_integrations`; nenhuma mudança no namespace do banco
- Testes de `connections.service.spec.ts` validam que múltiplos `create` são chamados sem `findFirst` de existência
