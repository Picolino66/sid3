# ADR-0011: Cota do Google Drive nas Estatísticas

## Status

Accepted

## Contexto

As estatísticas de armazenamento do SID3 mostravam apenas o uso interno (soma dos `size_bytes` dos objetos no banco), calculado sem consultar o Google Drive. O usuário não sabia quanto espaço real tinha disponível na conta Google nem quanto estava usando no total (incluindo arquivos fora do SID3).

## Decisão

Para cada conexão com status `CONNECTED`, o endpoint `GET /projects/:projectId/stats/storage` agora chama `drive.about.get({ fields: 'storageQuota' })` e inclui no retorno:

- `driveQuotaLimitBytes`: limite total da conta (null para contas ilimitadas como Google Workspace).
- `driveQuotaUsageBytes`: uso total de armazenamento na conta Google.
- `driveQuotaUsageInDriveBytes`: uso por arquivos do Drive especificamente.

Conexões com status `REVOKED` ou `ERROR` retornam `null` nos campos de cota sem chamar a Drive API.

Falhas na consulta de cota (token expirado, erro de rede) são tratadas com `Promise.allSettled` e `.catch(() => null)` — a falha de uma conexão não bloqueia as demais.

## Alternativas consideradas

- **Cache da cota no banco**: descartado porque a cota muda frequentemente e o custo de um campo stale é maior que o de uma chamada extra à Drive API (que é leve — retorna apenas metadados).
- **Endpoint separado para cota**: descartado para reduzir o número de chamadas do frontend.

## Consequências

- Cada chamada a `/stats/storage` faz N chamadas extras à Drive API (uma por conexão CONNECTED). Para projetos com muitas conexões, o tempo de resposta aumenta proporcionalmente.
- O dashboard exibe a barra de cota real do Drive e o percentual de uso.
- Contas Google com armazenamento ilimitado exibem "ilimitado" em vez de barra de progresso.
