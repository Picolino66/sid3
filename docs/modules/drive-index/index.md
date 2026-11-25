# Índice do Google Drive ("Meu Drive")

Permite ver e baixar **todo** o conteúdo de uma conta Google Drive conectada, não só os arquivos enviados pelo SID3:
"Meu Drive", "Compartilhados comigo" e todos os **drives compartilhados** (Shared Drives) dos quais a conta é membro.
O SID3 mantém um índice local (tabela `drive_index_entries`) para não percorrer o Drive a cada listagem.

Código: `api/src/modules/drive-index/` (API) e `dashboard/src/app/features/drive/` (tela "Meu Drive").

## Pré-requisito: escopo `drive.readonly`

- O escopo padrão passou a ser `drive.file drive.readonly` (`GOOGLE_DRIVE_SCOPES`).
- O SID3 grava os escopos **concedidos** pelo Google (`tokens.scope`), pois o usuário pode desmarcar a leitura na tela de consentimento.
- Sem `drive.readonly` (ou `drive`), `refresh` e `download` retornam `403` e a tela mostra "Reconectar com leitura".
- `drive.readonly` é um escopo restrito do Google: em modo de teste exige cadastrar as contas como *test users*; para produção, exige verificação do app.

## Ciclo de indexação

| Momento | O que acontece |
| --- | --- |
| Conectar uma conta nova | Varredura completa em segundo plano (`full`) |
| Reconectar uma conta | Atualização incremental |
| Clicar em **Atualizar** | Incremental: aplica só as mudanças desde a última vez (Google Drive Changes API) |
| Clicar em **Reindexar tudo** | Varredura completa |
| Token de mudanças expirado | Cai automaticamente para varredura completa |

- **Varredura completa**: obtém o `startPageToken` da Changes API *antes* de listar (nada alterado durante a varredura se perde), lista `files.list` com `trashed = false` em páginas de 1000 no corpus do usuário (`corpora: user`, com `includeItemsFromAllDrives` para trazer itens compartilhados diretamente a partir de drives compartilhados dos quais a conta não é membro), depois lista os drives compartilhados (`drives.list`) e varre cada um (`corpora: drive`). Faz upsert de cada item e remove do índice tudo que não foi visto nesta varredura.
- **Incremental**: percorre `changes.list` (com `includeItemsFromAllDrives`) a partir do token salvo — um único token cobre o Meu Drive e todos os drives compartilhados. Item removido ou movido para a lixeira sai do índice junto com seus descendentes (no caso de pastas).
- **Pastas compartilhadas comigo**: o corpus `user` só devolve arquivos da conta, abertos por ela ou compartilhados diretamente — o conteúdo de uma pasta de outra pessoa fica de fora. Por isso, depois da listagem do usuário (e a cada atualização incremental, já que a Changes API também não informa o que muda nessas pastas), são percorridas pelo pai (`'id' in parents`, recursivamente) as pastas de outras pessoas (`owned_by_me = false`) e as pastas de drives compartilhados dos quais a conta não é membro. É uma pasta por consulta, 6 em paralelo: com várias pastas unidas por `or`, o Google devolve só o que já está no corpus do usuário. O que o índice tinha numa dessas pastas e o Google não devolveu mais sai do índice com seus descendentes.
- **Mudanças de drive** (`changeType = drive`): drive renomeado atualiza o nome; drive excluído ou acesso perdido remove o drive e todo o seu conteúdo; drive em que a conta acabou de entrar é varrido por inteiro (a Changes API não reemite os arquivos dele).

### Como os drives compartilhados ficam no índice

- Cada drive compartilhado vira uma entrada de topo com `is_shared_drive = true`, `provider_file_id = drive_id` e sem pai.
- Itens na raiz do drive têm `parent_file_id = drive_id`; todos os itens do drive guardam `drive_id`.
- O download usa `supportsAllDrives`, então funciona igual para arquivos de drives compartilhados.
- Roda em segundo plano dentro do processo da API. Um lock otimista na conexão (`drive_index_status = INDEXING`) impede duas execuções simultâneas; um lock com mais de 30 min é considerado abandonado.
- Ao iniciar, a API marca como `FAILED` qualquer execução que tenha ficado em `INDEXING` (reinício no meio da varredura). Isso assume uma única instância da API.
- O índice não é atualizado sozinho: só ao conectar ou quando o usuário pede.

Status da conexão: `NEVER_INDEXED` → `INDEXING` → `READY` | `FAILED` (com `lastError`).

## Endpoints (JWT do dashboard)

Todos sob `/api/v1/connections/{connectionId}` e restritos ao dono da conexão.

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/drive-index` | Status da indexação |
| `POST` | `/drive-index/refresh` | Agenda atualização (`{ "mode": "incremental" \| "full" }`), responde `202` |
| `GET` | `/drive-files?parentId=&q=&page=&pageSize=` | Lista uma seção (`root` padrão, `shared-drives`, `shared`) ou uma pasta/drive pelo ID, ou busca por nome em todo o índice. Pastas primeiro; inclui `section` e `breadcrumb` |
| `GET` | `/drive-files/{fileId}` | Metadados de um item indexado |
| `GET` | `/drive-files/{fileId}/download` | Baixa o arquivo direto do Google Drive |
| `GET` | `/drive-files/{fileId}/download-zip` | Baixa a pasta inteira, com subpastas, em ZIP ([detalhes](zip-download.md)) |

Download:

- Docs, Planilhas e Apresentações do Google são exportados para `docx`, `xlsx` e `pptx`; Desenhos para `png` (`exportExtension` na listagem).
- Pastas retornam `422` no download de arquivo: use `download-zip`. Formulários, Sites e atalhos também retornam `422`.
- Só baixa arquivos presentes no índice da conexão (`404` caso contrário, sugerindo atualizar o índice).
- `Content-Disposition` usa `filename*` (RFC 5987) para nomes com acentos.

## Limitações conhecidas

- Itens compartilhados com o usuário sem pasta pai visível aparecem em "Compartilhados comigo" (`parentId=shared`).
- A busca por nome cobre todas as seções; o resultado não indica em qual drive o item está além de `driveId`.
- Download e listagem do índice não geram `operation_logs`, pois esses logs são por projeto e o índice é por conexão.
