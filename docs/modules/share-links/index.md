# Links de compartilhamento público

O usuário seleciona N arquivos, pastas ou drives compartilhados na tela **Meu Drive** e gera um link público.
Qualquer pessoa com o link vê e baixa esses itens, sem login. Pastas e drives compartilhados incluem todo o seu conteúdo.

Código: `api/src/modules/share-links/` (API) e `dashboard/src/app/features/share-links/` (diálogo, tela "Links compartilhados" e página pública `/s/:token`).

## Fluxo

1. **Meu Drive**: caixas de seleção por linha e "selecionar todos da página". A seleção é mantida ao navegar entre pastas e seções (Meu Drive, Drives compartilhados, Compartilhados comigo) e é limpa ao trocar de conta. Máximo de 500 itens por link.
2. **Gerar link público**: nome opcional e validade (nunca, 1, 7, 30 ou 90 dias). O diálogo mostra a URL com botão de copiar.
3. **Links compartilhados**: lista os links com itens, status (ativo, expirado, desativado), número de acessos, último acesso e validade. Permite copiar, abrir e **desativar**.
4. **Página pública** `/s/{token}`: fora do login e do layout do dashboard. Lista os itens, navega pelas pastas com caminho (breadcrumb) e baixa os arquivos por link direto (streaming, sem carregar na memória do navegador). Também baixa **pastas em ZIP** (botão "ZIP" em cada pasta, "Baixar esta pasta (ZIP)" dentro de uma pasta) e **todos os itens do link em um ZIP** ("Baixar tudo (ZIP)").

## Segurança

- **Token**: 32 bytes aleatórios em base64url (43 caracteres). O banco guarda o `sha256` (para busca) e uma cópia criptografada com `TOKEN_ENCRYPTION_KEY` (para o dono poder copiar o link de novo). Tokens fora do formato são recusados sem consultar o banco.
- **Escopo do acesso**: toda listagem de pasta e todo download sobe pelos pais do item no índice até encontrar um item do link. Se a subida acaba sem encontrá-lo, a resposta é `404`. Assim, nada fora dos itens escolhidos (pastas vizinhas, raiz do Drive, outros drives) fica acessível, mesmo adivinhando IDs.
- **Respostas públicas** não expõem e-mail do dono, IDs de conexão, checksum nem link do Google Drive. Mostram só o nome de exibição do dono.
- **Erros do Google** no download público viram uma mensagem genérica (`502`). O detalhe fica só no log do servidor.
- Cabeçalhos `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` e `Referrer-Policy: no-referrer` nas rotas públicas.
- **Estados**: link inexistente → `404`; desativado ou expirado → `410`; conexão do dono revogada ou sem `drive.readonly` → `503`.
- Só é possível criar links para itens presentes no índice da conexão do próprio usuário, e só com conexão ativa e com escopo de leitura.

## Endpoints

Dono (JWT):

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/share-links` | Cria o link (`connectionId`, `fileIds[]`, `name?`, `expiresInDays?`) |
| `GET` | `/share-links?connectionId=` | Lista os links do usuário (até 200, mais recentes primeiro) |
| `GET` | `/share-links/{id}` | Detalhe |
| `POST` | `/share-links/{id}/revoke` | Desativa |

Público (sem autenticação; o token é a credencial):

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/public/shares/{token}` | Itens do link (conta um acesso) |
| `GET` | `/public/shares/{token}/folders/{folderId}?page=` | Conteúdo de uma pasta dentro do link (100 por página) |
| `GET` | `/public/shares/{token}/search?q=&page=` | Busca por nome em todos os itens do link e no conteúdo das pastas (50 por página, sem diferenciar acentos) |
| `GET` | `/public/shares/{token}/files/{fileId}/download` | Download (Docs/Planilhas/Apresentações exportados para Office) |
| `GET` | `/public/shares/{token}/files/{fileId}/content?start=` | Imagem, vídeo ou áudio para exibir no navegador; aceita `Range` (`206`/`416`) para avançar o vídeo. `start` faz o arquivo "começar" naquele byte (o `Range` passa a ser relativo a ele) |
| `GET` | `/public/shares/{token}/files/{fileId}/media-info` | Duração do vídeo segundo o Google Drive (`durationMs`, nula se indisponível) |
| `GET` | `/public/shares/{token}/folders/{folderId}/download-zip` | ZIP de uma pasta do link, com subpastas |
| `GET` | `/public/shares/{token}/download-zip` | ZIP com todos os itens do link |

## Pré-visualização e busca na página pública

- Cada item traz `previewKind` (`image`, `video`, `audio` ou nulo). A página abre um visualizador com navegação entre as mídias da lista (setas do teclado ou botões) e toca o vídeo em streaming pela rota `/content`.
- `/content` só serve imagem (exceto SVG), vídeo e áudio, sempre com `Content-Disposition: inline`, `X-Content-Type-Options: nosniff` e `Content-Security-Policy: default-src 'none'; sandbox` — HTML, SVG e PDF não são exibidos inline para não executar conteúdo na origem da API.
- O header `Range` é repassado ao Google; intervalos fora do arquivo respondem `416` sem consultar o Google.
- O navegador reproduz nativamente MP4/H.264, WebM, MP3 etc. Quando ele recusa um vídeo, a página tenta tocá-lo como **MPEG-TS** (comum em aulas baixadas de streaming e salvas como `.mp4`): o `mpegts.js` converte o fluxo para MP4 no navegador (Media Source Extensions). A biblioteca (~53 KB comprimida) só é baixada nesse caso.
- MPEG-TS não tem índice, então o `mpegts.js` não avança para trechos não carregados. O player usa controles próprios: com a duração do Google Drive (`/media-info`), estima o byte do tempo pedido (taxa de bits constante, alinhado a pacotes de 188 bytes) e recomeça a conversão com `?start=`. A posição exibida é estimada; em vídeos de taxa variável pode ficar alguns segundos fora. Sem duração, o vídeo toca do início, sem barra de avanço.
- Se nem a conversão funcionar, o visualizador oferece o download.
- A busca monta a árvore no banco (CTE recursiva) a partir dos itens do link, então só encontra itens dentro deles. Cada resultado traz `path` (pastas até ele) e `parentId` para abrir a pasta onde está.

## Comportamento com o índice

- O link guarda os IDs do Google Drive, não linhas do índice; reindexar não quebra links.
- O que o visitante vê reflete o **índice**, não o Drive em tempo real. Um arquivo novo dentro de uma pasta compartilhada só aparece depois que o dono clicar em Atualizar; um item excluído some na próxima atualização (o dono vê "indisponível" na tela de links).
- O download sempre busca o conteúdo atual no Google Drive.

## Limitações conhecidas

- Não há limite de taxa (rate limit) nas rotas públicas; downloads consomem a cota da API do Google do dono.
- O ZIP de pastas segue as regras de [download em ZIP](../drive-index/zip-download.md).
- Acessos são contados por abertura do link, não por download, e não geram `operation_logs` (que são por projeto).
