# ADR-0012: Pasta raiz `sid3` no Google Drive

## Status

Accepted

## Contexto

O ADR-0009 passou a organizar os arquivos de cada bucket em uma pasta própria,
mas essas pastas ainda eram criadas diretamente na raiz do Google Drive. Isso
misturava recursos administrados pelo SID3 com os arquivos pessoais do usuário.

## Decisão

Para cada conexão Google Drive usada em um upload, o SID3 resolve de forma lazy
uma pasta chamada `sid3` na raiz desse Drive. A pasta do bucket é então buscada
ou criada dentro dela:

```text
Google Drive
└── sid3
    ├── bucket-a
    └── bucket-b
```

A regra vale para buckets ligados diretamente a uma conexão e para cada Drive
selecionado por um storage pool. Os IDs das pastas de bucket continuam em cache
em `provider_root_ref` ou `BucketFolderRef`; por isso, uploads posteriores não
fazem novas buscas de pasta.

A migração invalida somente esses caches existentes. No primeiro upload após a
migração, o SID3 recria as referências apontando para a nova hierarquia. Arquivos
e metadados existentes não são movidos nem apagados, e downloads e exclusões
continuam usando os respectivos IDs de arquivo já registrados.

## Alternativas consideradas

- Manter os buckets na raiz: rejeitada porque continua poluindo a visão principal
  do Drive.
- Mover automaticamente as pastas e arquivos legados: rejeitada nesta evolução
  por exigir uma operação remota potencialmente longa, parcial e difícil de
  reverter.
- Criar a pasta `sid3` ao conectar a conta: rejeitada para preservar o fluxo lazy
  e evitar uma chamada ao Drive durante OAuth.

## Consequências

- Novos uploads ficam isolados em `sid3/<bucket>`.
- O primeiro upload de cada bucket em cada Drive faz a resolução da pasta raiz e
  da pasta do bucket.
- Estruturas antigas permanecem no Drive até serem organizadas manualmente por
  seu proprietário; elas não recebem novos uploads depois que a migração é
  aplicada.

## Relação com decisões anteriores

Esta ADR substitui e refina o ADR-0009.
