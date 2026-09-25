# Organização de uploads no Google Drive

## Descrição

Todo upload do SID3 para uma conexão Google Drive é armazenado dentro da pasta
raiz `sid3`, com uma subpasta para cada bucket.

## Localização no código

- `api/src/modules/objects/objects.service.ts`
- `api/src/modules/storage-providers/google-drive-storage.provider.ts`
- `api/prisma/migrations/20260810000000_nest_buckets_under_sid3_root/migration.sql`

## Entrada

Um upload autenticado por API key para um bucket, usando uma integração direta
ou uma integração selecionada por storage pool.

## Saída

O arquivo é criado em `sid3/<nome-do-bucket>` no Google Drive selecionado.

## Dependências

Google Drive API, `GoogleDriveStorageProvider`, `ObjectsService`, Prisma e o
cache de pasta do bucket (`provider_root_ref` ou `BucketFolderRef`).

## Regras de negócio

- A pasta `sid3` é criada apenas quando for necessária.
- Cada Drive de um storage pool tem sua própria pasta `sid3`.
- O cache guarda a pasta do bucket, não a pasta raiz.
- A migração limpa somente caches antigos; não move nem exclui arquivos.

## Fluxo resumido

1. O SID3 verifica o cache da pasta do bucket.
2. Se ausente, localiza ou cria `sid3` na raiz da conexão Google Drive.
3. Localiza ou cria o bucket dentro de `sid3` e armazena o ID no cache.
4. Envia o arquivo para a pasta do bucket.

## Possíveis erros

- Falha de autenticação, cota ou rede na Google Drive API retorna erro de
  integração e impede a criação do objeto pendente.
- Se uma pasta em cache for apagada manualmente, o upload pode falhar até que o
  cache seja reconciliado.
