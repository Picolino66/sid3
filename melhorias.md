# Catálogo de Melhorias & Evoluções Técnicas — SID3 (SInsideDrive3)

> **Documento Gerado pelo Autonomous Software Orchestrator**  
> **Referência Arquitetural**: [overview.md](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/overview.md) | [context.json](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/docs/orchestration/context.json) | [AGENT.md](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/AGENT.md)  
> **Objetivo**: Mapear oportunidades de refatoração, otimização de performance, segurança, experiência de usuário (UX) e evolução do produto para as fases F5, F6 e F7.

---

## 🧭 Matriz de Priorização (Esforço x Impacto)

```
ALTO IMPACTO
    ▲
    │  [A1] Eliminar Drift OpenAPI           [B1] Fila Assíncrona (BullMQ)
    │  [D1] Script de Teste Serial            [B2] URLs Assinadas (Signed URLs)
    │  [C1] Barra de Progresso no Dashboard   [E1] Gateway Compatível com AWS S3
    │
    │  [C2] Notificações Toast Globais       [B3] Reconciliação / Limpeza de Órfãos
    │  [A2] Comitar Migrações Pendentes       [B4] Cache de Quotas Google Drive
    │  [D2] Configurar Testes no Angular      [E2] Multi-Cloud (OneDrive, Dropbox)
    └────────────────────────────────────────────────────────────────────────►
       BAIXO ESFORÇO (Quick Wins)                 ALTO ESFORÇO (Estratégico)
```

---

## 1. Backend & Arquitetura de Armazenamento (`sid3-api`)

### 1.1. Processamento Assíncrono de Uploads Volumosos (Fila com BullMQ + Redis)
- **Problema Atual**:
  - No fluxo de upload ([`objects.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/objects/objects.service.ts#L80)), arquivos de até 1 GB (`SID3_MAX_UPLOAD_MB`) são recebidos via multipart, gravados temporariamente em `/tmp/sid3-uploads` e enviados ao Google Drive **de forma síncrona dentro da requisição HTTP**.
  - Isso retém a conexão HTTP aberta por vários minutos (timeout configurado em 30 min), esgota conexões do proxy/load balancer e gera risco de quebra de socket se a rede do cliente oscilar.
- **Proposta de Melhoria**:
  - Para uploads superiores a um determinado limiar (ex: > 50 MB), adotar um padrão assíncrono:
    1. A API recebe o arquivo e gera um registro com status `PROCESSING` ou retorna um `jobId`.
    2. O upload remoto para o Google Drive é delegado para uma fila no Redis gerenciada pelo **BullMQ**.
    3. O cliente consulta o status da tarefa via endpoint `GET /projects/:id/jobs/:jobId` ou via Server-Sent Events (SSE) / WebSocket.
- **Benefícios**: Desafogamento do loop de eventos do Node.js, tolerância a falhas transitórias com política de retry automático e estabilidade de conexões HTTP.
- **Arquivos Afetados**: [`objects.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/objects/objects.service.ts), [`objects.controller.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/objects/objects.controller.ts), criação do módulo `jobs/`.

---

### 1.2. Cron de Reconciliação e Limpeza de Objetos "Órfãos" e Travados
- **Problema Atual**:
  - Se o servidor reiniciar abruptamente ou sofrer crash durante um upload ou exclusão, o objeto no banco de dados pode ficar permanentemente travado nos status transitórios `PENDING` ou `DELETING`.
  - Além disso, arquivos temporários podem restar em `/tmp/sid3-uploads` caso o processo seja morto com `SIGKILL` antes do [`upload-cleanup.interceptor.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/objects/upload-cleanup.interceptor.ts) finalizar.
- **Proposta de Melhoria**:
  - Criar um serviço agendado (`@nestjs/schedule` com cron diário/horário) que:
    1. Localiza objetos com status `PENDING` criados há mais de 1 hora.
    2. Consulta o Google Drive para verificar se o `providerFileId` existe; se não existir, atualiza o status para `FAILED`.
    3. Localiza objetos em `DELETING` há mais de 30 minutos e re-executa a exclusão idempotente no Drive, finalizando como `DELETED`.
    4. Varre `/tmp/sid3-uploads` e expurga arquivos com mais de 2 horas de inatividade.
- **Benefícios**: Autocura do sistema, conformidade de auditoria e liberação de espaço em disco no servidor.
- **Arquivos Afetados**: [`objects.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/objects/objects.service.ts), novo módulo ou serviço `reconciliation.service.ts`.

---

### 1.3. Cache com TTL para Consulta de Cotas do Google Drive
- **Problema Atual**:
  - Conforme definido no [ADR-0011](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/docs/orchestration/adr/ADR-0011-drive-quota-in-stats.md), cada chamada ao endpoint `GET /projects/:projectId/stats/storage` ([`stats.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/stats/stats.service.ts#L45)) executa uma requisição `drive.about.get` para **cada conta conectada**.
  - Em projetos com pools contendo 5 a 10 contas Google, essa chamada torna o endpoint lento (latência de vários segundos) e queima cota da Google Cloud sem necessidade, já que o espaço em disco não muda a cada segundo.
- **Proposta de Melhoria**:
  - Implementar um cache em memória (ou Redis) com TTL de 5 a 10 minutos para o resultado do `getDriveQuota`.
  - Fornecer um parâmetro opcional na query `?force=true` ou endpoint dedicado para quando o usuário clicar explicitamente em "Atualizar cota" no painel.
- **Benefícios**: Redução de 90% das requisições remotas à Drive API na tela de estatísticas e carregamento instantâneo do dashboard.
- **Arquivos Afetados**: [`stats.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/stats/stats.service.ts), [`google-drive-storage.provider.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/storage-providers/google-drive-storage.provider.ts).

---

### 1.4. URLs Assinadas Temporárias para Download e Upload (Signed URLs)
- **Problema Atual**:
  - Todo download de arquivo precisa passar pelo servidor SID3 através do endpoint `GET /projects/:id/buckets/:bucket/objects/:key/download`, que autentica via `X-SID3-API-Key` e faz stream dos bytes do Google Drive para o cliente.
  - Isso obriga o servidor a atuar como proxy de tráfego de dados para 100% dos downloads, consumindo CPU, memória e banda de rede.
- **Proposta de Melhoria**:
  - Criar um endpoint `POST /projects/:id/buckets/:bucket/objects/:key/sign-download`:
    * Gera um token efêmero assinado HMAC (ex: válido por 15 minutos).
    * Permite que um cliente web (ex: tag `<img src="...">` ou leitor de PDF) baixe o arquivo via URL pública temporária e segura sem ter que passar a API Key no cabeçalho.
- **Benefícios**: Permite embutir mídias em aplicações web consumidoras de forma segura e padronizada.
- **Arquivos Afetados**: [`objects.controller.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/objects/objects.controller.ts), [`objects.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/objects/objects.service.ts).

---

### 1.5. Versionamento e Histórico de Arquivos (Object Versioning)
- **Problema Atual**:
  - Atualmente, ao enviar um arquivo com chave duplicada, o sistema rejeita com HTTP `409 Conflict` ([`objects.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/objects/objects.service.ts#L104)). O usuário é obrigado a excluir o arquivo anterior antes de subir a nova versão.
- **Proposta de Melhoria**:
  - O Google Drive suporta nativamente criar revisões do mesmo arquivo via `drive.files.update`.
  - Adicionar suporte a versionamento configurável por bucket (`versioningEnabled: boolean`):
    * Cada upload com a mesma chave cria uma nova revisão (`versionId`) em vez de conflitar.
    * O cliente pode baixar uma versão específica (`?versionId=...`) ou a versão mais recente por padrão.
- **Benefícios**: Paridade com Amazon S3 / Google Cloud Storage e prevenção contra perda acidental de dados em sobrescritas.
- **Arquivos Afetados**: [`schema.prisma`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/prisma/schema.prisma), [`objects.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/objects/objects.service.ts).

---

## 2. Frontend & Experiência do Usuário (`sid3-dashboard`)

### 2.1. Barra de Progresso Real no Upload de Arquivos
- **Problema Atual**:
  - Na tela de arquivos ([`files-page.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/features/files/files-page.component.ts#L65)), o botão apenas exibe o texto estático `"Enviando..."` enquanto a requisição HTTP está em voo.
  - Para arquivos médios e grandes (100 MB a 1 GB), o usuário fica sem feedback visual do progresso da transmissão, gerando sensação de travamento e tentativas de cancelamento.
- **Proposta de Melhoria**:
  - Utilizar a funcionalidade nativa do Angular `HttpClient`:
    ```typescript
    this.http.post(url, formData, {
      reportProgress: true,
      observe: 'events'
    }).subscribe(event => {
      if (event.type === HttpEventType.UploadProgress && event.total) {
        this.uploadProgress.set(Math.round((100 * event.loaded) / event.total));
      }
    });
    ```
  - Renderizar uma barra de progresso visual com porcentagem e velocidade estimada de transferência.
- **Benefícios**: Melhoria substancial na percepção de performance e usabilidade.
- **Arquivos Afetados**: [`files.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/features/files/files.service.ts), [`files-page.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/features/files/files-page.component.ts).

---

### 2.2. Serviço Global de Notificações Toast
- **Problema Atual**:
  - As mensagens de erro e sucesso são controladas individualmente em cada componente através de sinais locais (`errorMessage = signal<string | null>(null)`).
  - Isso gera código repetitivo e layouts inconsistentes em formulários e tabelas.
- **Proposta de Melhoria**:
  - Criar um `NotificationService` singleton com um container de Toast no layout principal ([`dashboard-shell.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/layout/dashboard-shell.component.ts)):
    * Notificações com auto-dismiss (ex: 4 segundos para sucesso, persistente com botão fechar para erros).
    * Suporte a tipos: `success`, `error`, `warning`, `info`.
- **Benefícios**: Código mais limpo nos componentes de página e feedback visual padronizado.
- **Arquivos Afetados**: Criação de `core/notifications/notification.service.ts`, [`dashboard-shell.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/layout/dashboard-shell.component.ts).

---

### 2.3. Pré-visualização de Arquivos e Mídias no Dashboard
- **Problema Atual**:
  - O explorador de arquivos apenas permite listar e fazer download dos arquivos no disco.
  - Para saber se um arquivo de imagem (`.png`, `.jpg`), documento (`.pdf`) ou texto (`.txt`, `.json`) está correto, o operador precisa obrigatoriamente baixá-lo.
- **Proposta de Melhoria**:
  - Adicionar um botão de ação "Visualizar" na listagem de arquivos para tipos MIME conhecidos (`image/*`, `application/pdf`, `text/*`).
  - Abrir um modal com leitor embutido gerando um `blob:` URL temporário via `URL.createObjectURL`.
- **Benefícios**: Agilidade no gerenciamento diário de mídias e conferência de arquivos.
- **Arquivos Afetados**: [`files-page.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/features/files/files-page.component.ts).

---

### 2.4. Aviso Proativo de Pasta `sid3` Pendente na Tela de Arquivos
- **Problema Atual**:
  - Quando uma conexão está com o status `PENDING_CONFIRMATION` (aguardando a decisão de reuso ou criação da pasta `sid3` no Google Drive), o bloqueio só é percebido quando o usuário tenta realizar o upload e recebe um erro `409 Conflict`.
- **Proposta de Melhoria**:
  - Na tela de Upload de Arquivos ([`files-page.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/features/files/files-page.component.ts)), ao selecionar um bucket cuja conexão subjacente esteja pendente de confirmação:
    * Exibir um banner explicativo amarelo: *"A conexão vinculada a este bucket possui uma confirmação de pasta pendente"*.
    * Oferecer botão direto que abre o modal de resolução ou redireciona para a aba de Conexões.
- **Benefícios**: Prevenção de frustração do usuário antes do envio de arquivos.
- **Arquivos Afetados**: [`files-page.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/features/files/files-page.component.ts).

---

## 3. Governança de Contratos, Dados & Documentação

### 3.1. Eliminação do Drift no Contrato OpenAPI (`openapi-v1.yaml`)
- **Problema Atual**:
  - A especificação formal [`docs/contracts/openapi-v1.yaml`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/docs/contracts/openapi-v1.yaml) ainda utiliza caminhos legados `/integrations/*` da fase F3.
  - Com a evolução para [ADR-0007](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/docs/orchestration/adr/ADR-0007-multi-drive-per-user.md) (Multi-Drive), as rotas da API foram alteradas para `/connections/*`.
  - Além disso, faltam documentar:
    * `POST /connections/:id/sid3-root/confirm` ([DTO](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/connections/dto/confirm-sid3-root-folder-request.dto.ts))
    * `POST /connections/:id/reauthorize`
    * `PATCH /connections/:id` (atualização de `displayName`)
    * `POST /projects/:id/api-keys/:id/regenerate` ([ADR-0010](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/docs/orchestration/adr/ADR-0010-api-key-regeneration.md))
    * Módulo completo de Storage Pools (`/projects/:id/storage-pools`) ([ADR-0008](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/docs/orchestration/adr/ADR-0008-storage-pool-routing.md))
- **Proposta de Melhoria**:
  - Adotar uma abordagem **Code-First / Scripted Sync**:
    * Criar um script `scripts/export-swagger-spec.mjs` que inicia o NestJS em modo headless, extrai a árvore Swagger compilada dos decorators e sobrescreve [`docs/contracts/openapi-v1.yaml`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/docs/contracts/openapi-v1.yaml).
- **Benefícios**: Eliminação total de manutenção manual de YAML, garantindo que o contrato público reflita 100% o código implementado.
- **Arquivos Afetados**: [`docs/contracts/openapi-v1.yaml`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/docs/contracts/openapi-v1.yaml), criação de `scripts/export-swagger-spec.mjs`.

---

### 3.2. Consolidação e Commit das Alterações Locais Pendentes
- **Problema Atual**:
  - Há arquivos importantes não comitados no repositório:
    * Migração SQL: `api/prisma/migrations/20260811000000_add_sid3_root_folder_confirmation/migration.sql`
    * DTO de confirmação: `confirm-sid3-root-folder-request.dto.ts`
    * Modificações de frontend e backend para resolução da pasta `sid3`.
- **Proposta de Melhoria**:
  - Organizar e commitar essas mudanças de forma semântica (ex: `feat(drive): add sid3 root folder confirmation dialog and usable check`), mantendo a árvore do Git limpa e pronta para tagging da fase F5.
- **Benefícios**: Rastreabilidade do histórico e prevenção contra perda de código em rebase ou checkout.

---

## 4. Engenharia de Qualidade & Testes

### 4.1. Adição de Script para Execução Segura de Testes (`test:serial`)
- **Problema Atual**:
  - O comando padrão `pnpm test` dispara o Jest com paralelismo de múltiplos workers. Em computadores pessoais ou ambientes com poucos cores/RAM, o consumo repentino de CPU e memória provoca **congelamento total do sistema operacional**.
- **Proposta de Melhoria**:
  - Adicionar scripts explícitos no [`api/package.json`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/package.json):
    ```json
    "scripts": {
      "test": "jest --runInBand --passWithNoTests",
      "test:serial": "jest --runInBand --passWithNoTests",
      "test:watch": "jest --runInBand --watch"
    }
    ```
  - Configurar `maxWorkers: 1` no `jest.config.js` para garantir que ninguém execute acidentalmente testes em paralelo localmente.
- **Benefícios**: Elimina 100% dos travamentos de máquina durante o desenvolvimento e execução de testes.
- **Arquivos Afetados**: [`api/package.json`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/package.json).

---

### 4.2. Implementação de Testes Automatizados no Dashboard Angular
- **Problema Atual**:
  - O frontend atualmente não possui testes implementados (`"test": "echo \"dashboard tests not implemented yet\""`).
- **Proposta de Melhoria**:
  - Configurar testes rápidos usando **Vitest** ou **Jest** para Angular:
    * Teste unitário do [`auth.guard.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/core/auth/auth.guard.ts) (redirecionamento quando não autenticado).
    * Teste do [`auth.interceptor.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/core/auth/auth.interceptor.ts) (injeção do header `Authorization: Bearer <token>`).
    * Teste do modal de confirmação de pasta raiz em [`connections-page.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/features/connections/connections-page.component.ts).
    * Teste da exibição única de segredo de API Key em [`api-keys-page.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/features/api-keys/api-keys-page.component.ts).
- **Benefícios**: Atendimento aos requisitos de qualidade do quality gate F6 e prevenção contra quebras em refatorações de interface.
- **Arquivos Afetados**: [`dashboard/package.json`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/package.json), criação de suítes `.spec.ts` no frontend.

---

## 5. Evolução Estratégica & Roadmap Futuro (F6 & F7)

### 5.1. Camada de Compatibilidade com AWS S3 (S3-Compatible Gateway)
- **Oportunidade**:
  - A maioria esmagadora de bibliotecas e ferramentas de mercado (AWS CLI, SDKs em Python/boto3, Go, Java, rclone, Cyberduck, MinIO) espera a API do Amazon S3.
- **Proposta de Melhoria**:
  - Criar um sub-módulo ou gateway que emula a API S3:
    * Autenticação via assinatura AWS Signature Version 4 (`Authorization: AWS4-HMAC-SHA256`).
    * Suporte aos métodos padrão:
      - `PUT /{bucket}/{key}` $\rightarrow$ Upload de objeto
      - `GET /{bucket}/{key}` $\rightarrow$ Download de objeto
      - `DELETE /{bucket}/{key}` $\rightarrow$ Exclusão de objeto
      - `GET /{bucket}` $\rightarrow$ Listagem XML padrão S3
  - Mapear o `Access Key ID` para o prefixo da API Key do SID3 e o `Secret Access Key` para o segredo da API Key.
- **Benefícios**: Permitir que qualquer software do mundo use o SID3 e o Google Drive sem instalar SDK próprio, apenas configurando o `endpoint_url`.

---

### 5.2. Webhooks e Notificação de Eventos de Armazenamento
- **Oportunidade**:
  - Plataformas de automação (n8n, Zapier, Make) e backends modernos demandam eventos acionáveis quando um novo arquivo é enviado ou removido.
- **Proposta de Melhoria**:
  - Permitir o cadastro de URLs de Webhook por projeto:
    * Eventos: `object.created`, `object.deleted`, `connection.quota_warning`.
    * Envio de payload assinado com cabeçalho `X-SID3-Signature` (HMAC SHA-256) para validação de autenticidade pelo recebedor.
- **Benefícios**: Integração nativa em pipelines de processamento de imagens, OCR, geração de relatórios e IA.

---

### 5.3. Expansão para Novos Provedores de Armazenamento (Multi-Cloud)
- **Oportunidade**:
  - O nome do projeto e a arquitetura [`StorageProviderRegistry`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/storage-providers/storage-provider.registry.ts) foram concebidos com a interface [`StorageProviderPort`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/storage-providers/storage-provider.registry.ts).
- **Proposta de Melhoria**:
  - Adicionar suporte a outros provedores de armazenamento em nuvem que clientes corporativos já possuem:
    1. **Microsoft OneDrive / SharePoint** (via Microsoft Graph API).
    2. **Dropbox** (via Dropbox API v2).
    3. **Cloudflare R2 / Backblaze B2** (para planos híbridos de ultra-baixo custo).
- **Benefícios**: Transformação do SID3 de um "Google Drive Gateway" em uma **Plataforma Completa de Unificação de Armazenamento em Nuvem Multi-Cloud**.

---

## 📋 Resumo das Ações e Status de Implementação

| # | Ação | Esforço | Status | Implementação |
|---|---|---|---|---|
| **1** | Configurar Jest no `api/package.json` com `--runInBand` e `maxWorkers: 1` | 10 min | ✅ Concluído | `api/package.json`, `api/jest.config.cjs` |
| **2** | Implementar cache TTL de 10 min para cota do Google Drive em `/stats/storage` | 2 horas | ✅ Concluído | [`stats.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/stats/stats.service.ts), [`stats.controller.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/stats/stats.controller.ts) |
| **3** | URLs Assinadas Temporárias para Download (Signed URLs) | 2 horas | ✅ Concluído | [`signed-url.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/objects/signed-url.service.ts), [`api-key-auth.guard.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/common/auth/api-key-auth.guard.ts) |
| **4** | Cron e Serviço de Reconciliação / Limpeza de Temporários e Objetos | 2 horas | ✅ Concluído | [`reconciliation.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/api/src/modules/objects/reconciliation.service.ts) |
| **5** | Barra de progresso no upload do Angular com `reportProgress: true` | 2 horas | ✅ Concluído | [`files.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/features/files/objects.service.ts), [`files-page.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/features/files/files-page.component.ts) |
| **6** | Serviço Global de Notificações Toast com auto-dismiss | 1 hora | ✅ Concluído | [`notification.service.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/core/notifications/notification.service.ts), [`dashboard-shell.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/layout/dashboard-shell.component.ts) |
| **7** | Aviso Proativo de Pasta `sid3` Pendente na Tela de Arquivos | 1 hora | ✅ Concluído | [`files-page.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/features/files/files-page.component.ts) |
| **8** | Pré-visualização de Arquivos e Mídias no Dashboard | 2 horas | ✅ Concluído | [`files-page.component.ts`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/dashboard/src/app/features/files/files-page.component.ts) |
| **9** | Sincronizar o contrato OpenAPI v1 com todos os endpoints reais | 1 hora | ✅ Concluído | [`openapi-v1.yaml`](file:///home/isaiasgr/%C3%81rea%20de%20trabalho/Projetos/github/SID3/docs/contracts/openapi-v1.yaml) (27 paths, 30 schemas) |
| **10** | Configurar testes automatizados rápidos no Dashboard Angular | 1 hora | ✅ Concluído | `dashboard/package.json`, `notification.service.spec.ts` |
| **11** | Gateway compatível com S3 e Webhooks para o roadmap F6/F7 | 1 sprint | ⏳ Planejado | Documentado no Roadmap Estratégico |
