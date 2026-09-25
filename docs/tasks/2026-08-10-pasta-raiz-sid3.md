# Plano técnico — pasta raiz `sid3` no Google Drive

## Contexto

Organizar todos os novos uploads do SID3 na hierarquia `sid3/<bucket>` em cada
conexão Google Drive, sem mudança no contrato público da API.

1. **Definir a hierarquia física de armazenamento**

   Objetivo: registrar a evolução da organização de buckets no Drive.

   Escopo técnico: criar ADR que substitui a decisão anterior de bucket na raiz,
   documentando comportamento de conexões diretas, pools e dados existentes.

   Critérios de aceitação:
   - ADR descreve `sid3/<bucket>` por conexão.
   - A decisão informa que não há movimentação remota de arquivos existentes.

2. **Resolver a pasta raiz antes da pasta do bucket**

   Objetivo: fazer o caso de uso de upload criar ou reutilizar `sid3` e criar o
   bucket como sua subpasta.

   Escopo técnico: adaptar `ObjectsService` preservando os caches atuais para
   buckets diretos e pools.

   Critérios de aceitação:
   - Primeiro upload usa `sid3/<bucket>`.
   - Upload posterior reutiliza o cache da pasta do bucket.
   - O contrato HTTP permanece inalterado.

3. **Invalidar caches de hierarquia antiga**

   Objetivo: evitar novos uploads em pastas de buckets que estavam na raiz.

   Escopo técnico: criar migração Prisma que limpe `provider_root_ref` e
   `BucketFolderRef`, preservando objetos e arquivos existentes.

   Critérios de aceitação:
   - A migração não altera `StorageObject`.
   - O próximo upload recria o cache na nova hierarquia.

4. **Validar e documentar o comportamento**

   Objetivo: cobrir a hierarquia nos testes e manter os documentos de produto e
   engenharia sincronizados.

   Escopo técnico: testes unitários de bucket direto e pool, documentação de
   dados, feature e progresso de engenharia.

   Critérios de aceitação:
   - Testes verificam `sid3` como pai do bucket.
   - Typecheck, build e testes relevantes passam.
