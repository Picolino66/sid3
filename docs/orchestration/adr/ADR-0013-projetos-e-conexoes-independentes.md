# ADR-0013: Projetos e conexões independentes, com vínculo explícito

## Status

Accepted (2026-11-26)

## Contexto

Em 25/11/2026 a conta Google de outra pessoa foi usada no botão "Reconectar" de uma conexão em produção.
Os tokens da conexão original foram substituídos, o SID3 não encontrou mais as pastas `sid3`/`fotos`,
recriou-as silenciosamente na conta errada e 26 arquivos foram gravados lá. Os 211 mil objetos
anteriores ficaram inacessíveis porque o bucket apontava para a conexão trocada e os objetos não
registravam em qual conta estavam.

Além do incidente, o painel misturava as entidades: cada tela tinha seu próprio seletor de projeto,
"Meu Drive" mostrava todas as contas do usuário e não havia como reorganizar nada sem editar o banco.

## Decisão

1. **Projetos e conexões são independentes.** O usuário cria N projetos e conecta N contas do Google Drive
   sem que um dependa do outro.
2. **Vínculo explícito `project_connections`.** Dentro de um projeto o usuário escolhe quais conexões ele
   pode usar. A mesma conexão pode estar em N projetos. Buckets, pools e o "Meu Drive"/links do projeto só
   enxergam conexões vinculadas. Desvincular é bloqueado enquanto buckets, pools ou arquivos do projeto
   dependem da conexão.
3. **Identidade da conta Google.** Ao conectar, o SID3 lê `about.user.permissionId` e o e-mail e grava em
   `provider_account_id`/`provider_account_email`. Reconectar com outra conta é recusado (409); conectar uma
   conta já conectada também. Conexões antigas sem identidade aceitam a primeira reconexão e passam a ter.
4. **Nada é recriado na conta errada.** Antes de recriar uma pasta de bucket ou a `sid3` que "sumiu", o SID3
   confirma que os tokens ainda são da mesma conta. Se mudou, marca a conexão como `ERROR`
   (`last_error = ACCOUNT_MISMATCH`) e bloqueia os envios.
5. **Todo objeto registra a conexão onde está** (`resolved_integration_id`), não só os de pool. A migração
   preenche os antigos. Trocar o destino de um bucket afeta só os próximos envios.
6. **Saúde da conexão.** Recusas de autorização do Google marcam a conexão como `ERROR`. Revogar cancela o
   acesso no Google (quando nenhuma outra conexão ativa usa a mesma conta) e apaga os tokens.
7. **Painel orientado a projeto.** Um seletor global de projeto; navegação em Projeto (Início, Arquivos,
   Meu Drive, Links, Armazenamento), Desenvolvedor (Chaves, Logs, Estatísticas, Docs) e Conta (Projetos,
   Conexões). O dono vê e envia arquivos com o próprio login (JWT), sem chave de API.

## Consequências

- **Pro:** isolar a conta de outra pessoa é só criar um projeto para ela e vincular a conta dela.
- **Pro:** o incidente de 25/11 não se repete: a troca de conta é recusada na reconexão e detectada no envio.
- **Pro:** buckets, projetos e conexões podem ser renomeados, redirecionados e excluídos pela interface,
  sempre bloqueando o que deixaria arquivos sem referência.
- **Contra:** uma etapa a mais para começar (vincular a conta ao projeto); o Início mostra o checklist.
- **Contra:** a listagem por pastas usa SQL bruto (`split_part`) sem índice de prefixo; medido em ~300 ms
  para 211 mil objetos. Se crescer muito, avaliar índice `text_pattern_ops` em `(bucket_id, key)`.
