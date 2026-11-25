# Download de pasta em ZIP

Disponível para o dono (tela **Meu Drive**, botão "Baixar ZIP" em cada pasta) e para quem tem um link público
(botão "ZIP" por pasta e "Baixar tudo (ZIP)"). Código: `api/src/modules/drive-index/drive-folder-zip.service.ts`.

## Como funciona

1. **Plano**: percorre as subpastas no **índice** (por nível, em lotes de 200 pastas) e define o caminho de cada item no ZIP. Não chama o Google nesta etapa.
2. **Streaming**: abre o ZIP na resposta HTTP e baixa **um arquivo por vez** do Google Drive, escrevendo direto no ZIP (biblioteca `archiver`). Não usa disco nem guarda o ZIP em memória no servidor. A resposta não tem `Content-Length`.
3. **Aviso**: itens que não entram (Formulários, Sites e atalhos do Google, ou arquivos que o Google não entregou) são listados em `LEIA-ME - arquivos nao incluidos.txt` dentro do ZIP. O motivo é genérico; o erro do Google fica só no log, pois o ZIP pode ir para visitantes anônimos.

## Regras dos nomes

- Docs, Planilhas, Apresentações e Desenhos do Google entram exportados (`.docx`, `.xlsx`, `.pptx`, `.png`).
- Pastas vazias são mantidas.
- Caracteres inválidos no Windows/macOS/Linux (`/ \ : * ? " < > |` e de controle) viram `_`; `.` e `..` viram `_`; nomes são limitados a 180 caracteres.
- Nomes repetidos na mesma pasta, sem diferenciar maiúsculas (comum no Drive), viram `nome (2).ext`, `nome (3).ext`...
- Imagens, vídeos, áudios, PDFs e arquivos compactados entram sem recompressão (economiza CPU); o resto é comprimido (deflate nível 6).

## Limites

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `SID3_ZIP_MAX_FILES` | 5000 | Máximo de arquivos por ZIP |
| `SID3_ZIP_MAX_MB` | 10240 (10 GB) | Soma máxima dos tamanhos no índice (Docs Google contam como 0) |

Acima do limite a API responde `413` antes de começar o download, sugerindo baixar subpastas.

## Comportamento

- Se o cliente cancela o download, o servidor para de baixar do Google imediatamente.
- Se um erro acontece no meio do streaming (cabeçalhos já enviados), a conexão é interrompida e o navegador mostra o download como falho.
- O conteúdo reflete o **índice**: arquivos criados depois da última atualização não entram até o dono clicar em Atualizar.
- Links públicos: a pasta precisa estar dentro do link (mesma regra de acesso da listagem); "Baixar tudo" junta todos os itens do link na raiz do ZIP.

## Limitações

- No **Meu Drive**, o dashboard recebe o ZIP via JavaScript (por causa do login JWT) e o navegador mantém o ZIP inteiro em memória antes de salvar. Para pastas muito grandes, prefira gerar um link público e baixar por ele (link direto, sem esse limite).
- Downloads grandes consomem a cota da API do Google do dono.
