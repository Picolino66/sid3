# ADR-0010: Regeneração de Segredo de API Key

## Status

Accepted

## Contexto

Usuários que perdem o segredo de uma API Key precisavam criar uma chave nova (com novo ID e nome) e revogar a antiga manualmente. Isso gera lixo na lista de chaves e exige atualização do nome para evitar duplicatas.

## Decisão

Adicionar endpoint `POST /projects/:projectId/api-keys/:apiKeyId/regenerate` que:

1. Gera um novo par `(prefix, secretHash)` via `ApiKeySecretService.generate()`.
2. Atualiza `prefix` e `secret_hash` do registro existente **em place** — mesmo `id`, mesmo `name`, mesma data de criação.
3. Retorna o novo segredo completo em texto claro (exibido uma única vez, igual ao fluxo de criação).
4. Não altera `revoked_at` — a chave permanece no estado em que estava.

## Alternativas consideradas

- **Revogar + criar nova**: descartado porque gera dois registros distintos na tabela, polui o histórico e força o usuário a atualizar referências ao ID da chave.
- **Exigir confirmação do segredo atual**: descartado porque o caso de uso principal é exatamente quando o segredo foi perdido.

## Consequências

- Clientes que usavam o segredo anterior deixam de funcionar imediatamente após a regeneração.
- O prefixo muda com a regeneração (faz parte da geração de segredo); a coluna `prefix` é atualizada.
- O histórico de `created_at` e `last_used_at` é preservado.
- O frontend exibe o novo segredo no mesmo banner amarelo do fluxo de criação, com botão "Copiar".
