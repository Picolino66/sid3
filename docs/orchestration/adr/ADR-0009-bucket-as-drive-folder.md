# ADR-0009: Bucket como Pasta no Google Drive

## Status

Accepted

## Contexto

Antes desta decisão, todos os arquivos enviados pelo SID3 iam para a raiz do Google Drive do usuário, sem qualquer organização. O campo `provider_root_ref` existia no modelo de `Bucket` mas nunca era preenchido. Para usuários com muitos arquivos, a raiz do Drive se tornava caótica.

## Decisão

Cada bucket corresponde a uma pasta no Google Drive com o mesmo nome. A pasta é criada de forma **lazy** (no primeiro upload) e o ID é cacheado para evitar chamadas repetidas à Drive API.

### Estratégia de cache

- **Bucket direto** (single-drive): folder ID cacheado em `Bucket.provider_root_ref`.
- **Bucket de pool** (multi-drive): folder ID cacheado por par `(bucket_id, provider_integration_id)` na tabela `BucketFolderRef`.

### Fluxo de resolução

1. Verificar cache local (banco).
2. Se não encontrado: buscar pasta por nome na raiz do Drive via `drive.files.list`.
3. Se não encontrada no Drive: criar pasta via `drive.files.create` com `mimeType = application/vnd.google-apps.folder`.
4. Persistir folder ID no cache.

### Race condition

Em uploads simultâneos ao mesmo bucket sem histórico, dois processos podem criar pastas com o mesmo nome no Drive. A segunda fica inativa (nunca é usada após o cache ser populado). O conflito de banco (`P2002` em `BucketFolderRef`) é tratado com fallback para `findUniqueOrThrow`.

## Alternativas consideradas

- **Eager (criar pasta ao criar o bucket)**: descartado porque exige chamada à Drive API no fluxo de criação de bucket, acoplando operações de banco e provider.
- **Sem cache (buscar no Drive em cada upload)**: descartado pelo custo de latência extra em cada upload.

## Consequências

- Arquivos ficam organizados em pastas nomeadas pelo bucket no Google Drive.
- Primeiro upload de um bucket tem latência levemente maior (busca ou cria pasta).
- Se o usuário deletar manualmente a pasta no Drive, o próximo upload falhará com `BadGatewayException`; retry automático é postergado para v2.
- `BucketFolderRef` precisa ser limpa em cascata quando um bucket ou integração é removida (FK com `onDelete: Cascade`).
