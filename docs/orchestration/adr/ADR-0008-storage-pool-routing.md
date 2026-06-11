# ADR-0008: Storage Pool e Pool Routing

## Contexto

Com suporte a múltiplos Drives por usuário (ADR-0007), surge a necessidade de abstrair N drives como uma única camada de armazenamento. A aplicação cliente não deve precisar saber em qual Drive específico um arquivo foi armazenado; o SID3 deve gerenciar essa distribuição automaticamente.

## Entidades introduzidas

- **`StoragePool`** — agrupa N conexões (ProviderIntegrations) de um projeto com uma estratégia de routing
- **`StoragePoolMember`** — ligação entre pool e integração, com `weight` e `roundRobinIndex`
- **`Bucket.storagePoolId`** — FK opcional para `StoragePool`; mutuamente exclusivo com `providerIntegrationId`
- **`StorageObject.resolvedIntegrationId`** — FK opcional que registra qual integração específica foi usada no upload

## Estratégias de routing

| Estratégia | Lógica | Trade-off |
|---|---|---|
| `ROUND_ROBIN` | Seleciona membro com menor `roundRobinIndex`, incrementa no banco | Distribuição equilibrada; seguro com múltiplas instâncias da API |
| `FILL_FIRST` | Seleciona o membro com menor soma de `sizeBytes` em `StorageObject` | Maximiza uso antes de mudar de Drive; requer query agregada por upload |
| `WEIGHTED` | Seleção aleatória ponderada por `weight` | Configurável; sem estado compartilhado; não garante uniformidade |

## Resolução de credentials para download/delete

O problema central: quando um arquivo foi enviado a um pool, o bucket não tem `providerIntegrationId` direta. A solução é `StorageObject.resolvedIntegrationId`:

- No upload via pool: a estratégia seleciona um membro → seu `providerIntegrationId` é salvo em `resolvedIntegrationId`
- No download/delete: se `resolvedIntegrationId != null`, busca credentials diretamente dessa integração; caso contrário, usa `bucket.providerIntegration` (caminho legado para buckets diretos)

Isso garante rastreabilidade e mantém compatibilidade retroativa com buckets de integração direta.

## Opções consideradas

1. Guardar apenas a estratégia no pool e sempre consultar em runtime (sem `resolvedIntegrationId`)
2. Guardar `resolvedIntegrationId` por objeto (abordagem escolhida)
3. Ter uma tabela de mapeamento objeto→integração separada

## Decisão

**Opção 2** — campo `resolvedIntegrationId` em `StorageObject`.

- Rastreabilidade completa: sabemos exatamente onde cada arquivo está armazenado
- Download/delete não requerem re-executar a estratégia (evita inconsistência se a estratégia mudar)
- Permite queries de stats por Drive (SUM de sizeBytes por `resolvedIntegrationId`)

## Consequências

- `objects.service.ts` importa `PoolRoutingFactory` via injeção de dependência
- `ObjectsModule` importa `StoragePoolsModule` (que exporta `PoolRoutingFactory`)
- Buckets existentes continuam funcionando: `providerIntegrationId` preenchido, `storagePoolId` nulo, `resolvedIntegrationId` nulo em objetos existentes
- Novos objetos em buckets de pool: `resolvedIntegrationId` preenchido, `providerIntegrationId` do bucket nulo
