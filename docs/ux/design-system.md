# SID3 Design System — proposta (Fase 2)

Status: **aprovado e implementado (Fase 3, 26/11/2026)** · Prévia visual: [design-system-preview.html](design-system-preview.html)
(abra no navegador e use o seletor Sistema/Claro/Escuro). Base: [diagnóstico da Fase 1](diagnostico-redesign-fase1.md).

## 1. Direção visual: "calmo e operacional"

- O painel fica quieto quando está tudo certo. Cor quente (alerta ou erro) só aparece onde há algo a fazer.
- O verde-petróleo da marca (`#13695d` no claro, `#34c9ac` no escuro) é a cor de **ação e seleção**. Não é usado como decoração.
- Neutros carregam 90% da interface: fundo cinza-claro, cards brancos, linhas finas de 8% e sombras quase invisíveis.
  No escuro, as sombras viram borda.
- A sidebar passa a ser **clara** (no escuro, ela fica escura). Hoje ela é um bloco preto que pesa mais que o conteúdo.
- Densidade de painel: texto base de 14px, controles de 36px e linhas de tabela de 48px. Em telas de toque, os controles crescem para 44px.
- Ícones Lucide em SVG inline, num sprite local (licença ISC, sem dependência nova), com traço de 1,6. Os emojis são removidos.

Fontes consultadas: `ui-ux-pro-max` (estilo "Minimalism & Swiss" para SaaS/dashboard, densidade alta, movimento sutil),
`dashboard-design` (tokens claro/escuro, estados, layout, tabelas), `ui-light-dark-designer` (paridade dos temas) e
`design-system-refactor-engine` (estrutura de tokens e componentes). Não existe `/referencia`. Esta direção foi proposta
do zero, preservando a identidade atual (marca "S3" verde).

## 2. Tokens

A fonte da verdade é o bloco `:root` da prévia, que será movido para `dashboard/src/styles/tokens.css`.

| Grupo | Tokens | Valores (claro / escuro) |
|---|---|---|
| Superfícies | `--color-page`, `card`, `soft`, `side` | `#f5f7f8 / #0b0f13`, `#fff / #131a20`, `#eef1f3 / #1b242c`, `#f9fafb / #0f1418` |
| Texto | `--color-ink`, `ink-2`, `muted` | `#111820 / #edf1f4`, `#3d4854 / #c2cbd3`, `#5c6875 / #8e9aa6` |
| Linhas | `--color-line`, `line-strong` | tinta a 8% e 16% (branco a 8% e 16% no escuro) |
| Ação | `--color-accent`, `accent-hover`, `on-accent`, `accent-text` | `#13695d / #34c9ac`, …, `#fff / #04211c`, `#0f5f54 / #4fd6bb` |
| Semântica | `--color-success`, `warn`, `danger`, `info` | `#16733d / #4ade80`, `#9a5b00 / #f5b84a`, `#c03a2b / #f87171`, `#1f62c7 / #6aa8ff` |
| Utilitários | `--color-focus`, `overlay`, `tip`, `on-tip` | anel de foco azul (distinto da marca), overlay 48% / 60% |
| Tipografia | `--font-sans` Inter, `--font-mono` JetBrains Mono; `--text-xs…2xl` = 12/13/14/16/18/22/28 | pesos 400/500/600; números tabulares |
| Espaço | `--space-1…16` = 4/8/12/16/20/24/32/40/48/64 | grade de 4px |
| Raio | `--radius-sm/md/lg/xl/full` = 6/8/12/16/999 | 6 em controles, 12 em cards, 16 em modais |
| Controles | `--control-sm/md/lg` = 32/36/40 | 40/44 com `pointer: coarse` |
| Sombra | `--shadow-card`, `pop`, `modal` | quase nula no claro; borda no escuro |
| Movimento | `--dur-fast/base/slow` = 150/200/250ms, `--ease-out`, `--ease-in` | `prefers-reduced-motion` zera as durações |
| Camadas | `--z-sticky/drawer/modal/toast/tooltip` = 10/40/50/60/70 | |
| Layout | `--sidebar-w` 248, `--topbar-h` 56, `--content-max` 1280 | breakpoints: 640 / 768 / 1024 / 1280 |

Regras:
- Fundos semânticos sempre como token + alpha (`color-mix(... 12%, transparent)`), para se adaptarem aos dois temas.
- **Nenhum hex fora de `tokens.css`.** Hoje são 101.
- Contraste verificado: todos os textos e chips passam de **4,5:1** em `card`, `page` e `soft`, nos dois temas.
  O menor valor é o chip de erro no claro, com 4,52:1.
- Tema: segue o sistema por padrão. O usuário pode fixar Claro ou Escuro (`data-theme` no `<html>`); a escolha fica salva no navegador.

## 3. Catálogo de componentes base

Componentes Angular standalone em `dashboard/src/app/shared/ui/`, com estilos que usam só tokens.

| Componente | Variantes / estados | Substitui hoje |
|---|---|---|
| `sid3-button` (diretiva em `button`/`a`) | primary · secondary (contorno) · ghost · danger · danger-ghost; sm/md; ícone; `loading` com largura estável | `button`, `.secondary`, `.danger`, `.button-link`, `.compact-button`, `.link-button` |
| `sid3-field` + input/select/textarea | rótulo visível, obrigatório, dica, **erro inline** ligado por `aria-describedby`, estado inválido | rótulos soltos, placeholder como rótulo |
| `sid3-checkbox`, `sid3-switch`, `sid3-segmented` | foco visível, `aria-pressed` | `.segmented`, checkboxes cruas |
| `sid3-search-input` | ícone, limpar, debounce de exibição | buscas do Drive e do link público |
| `sid3-status-chip` | success · warn · danger · info (com pulso para "Indexando") · neutral | `.status-label.*`, `.badge` |
| `sid3-card` | cabeçalho (título, descrição, ações), corpo, rodapé | `.panel`, `.kpi-card`, `.pool-card` |
| `sid3-kpi` | rótulo, ícone, valor tabular, rodapé/link | `.kpi-card`, `.status-grid` |
| `sid3-data-table` | toolbar (busca + filtros em chip sobre os dados carregados), cabeçalho ordenável (`aria-sort`), seleção + barra em massa, menu de linha "⋯", paginação; **vira lista-cartão com rótulos abaixo de 768px** | `.table` em grid de `div` e as 8 variantes `*-table` |
| `sid3-pagination` | anterior/próxima, "1–20 de 340" | `.drive-pagination`, "Carregar mais" |
| `sid3-menu` (dropdown) | itens com ícone, separador, item destrutivo, teclado (setas, Esc) | fileiras de 3–4 botões por linha |
| `sid3-dialog` + `ConfirmService` | foco preso, Esc, retorno do foco, variante destrutiva que nomeia a ação | 11× `window.confirm`, modais avulsos |
| `sid3-toast` (shell) | success/error/warning/info com ícone; `role=status` (erro: `alert`); embaixo à direita (topo no celular) | `.toast` atual (o serviço continua o mesmo) |
| `sid3-skeleton` | linha, bloco, linha de tabela, KPI | textos "Carregando…" |
| `sid3-empty-state` | ícone, título, texto curto, CTA | `.empty-state`, `.empty-cta`, `sid3-no-project-state` |
| `sid3-error-state` | mensagem em português + "Tentar novamente" + detalhe técnico recolhido | `.form-error` com `error.message` cru |
| `sid3-callout` | info/warn/danger/success, com ação | `.banner-warning`, `.alert--*`, `.secret-banner` |
| `sid3-copy-field` | valor mono somente leitura + Copiar com feedback | `.secret-box`, `.secret-row` |
| `sid3-meter` | barra de 6px, tom de alerta acima de 90% | `.conn-stat-bar`, `.upload-progress-*` |
| `sid3-breadcrumb`, `sid3-tabs`, `sid3-tooltip` | um único estilo para Arquivos, Drive, link público e Docs | 3 breadcrumbs diferentes, `.lang-tabs` |
| `sid3-file-preview` | um visualizador para Arquivos e Meu Drive; o do link público reaproveita o mesmo quadro | 3 modais de prévia |
| `sid3-icon` | sprite Lucide local | emojis 📁 🗄️ ▶ 📄 |
| `sid3-page-header` | eyebrow do projeto, título, descrição, ações | `.topbar` de cada página |

## 4. Padrões de painel

- **Layout geral:**
  - sidebar de 248px com o seletor de projeto como botão-menu (busca de projeto e "Gerenciar projetos");
  - topbar fixa com breadcrumb `Projeto › Página`, alternância de tema e menu do usuário (e-mail, Sair);
  - abaixo de 1024px, a sidebar vira gaveta, aberta pelo botão ☰.
- **Cabeçalho de página:** título, descrição curta opcional e **uma** ação primária à direita.
- **KPIs:** cards separados (só reportam, não filtram), com rótulo, ícone monocromático, valor de 28px e um rodapé de uma linha. O mesmo número tem o mesmo nome em toda tela.
- **Tabelas:**
  - busca, filtros e ordenação rodam **sobre os dados já carregados** (sem mudança de API);
  - ações em massa só onde a ação em lote já existe (seleção do Meu Drive → Gerar link);
  - nas demais tabelas, ação da linha num menu "⋯", com no máximo um atalho visível (ex.: Copiar link).
- **Filtros:** chips removíveis acima da tabela, e "Limpar filtros" quando houver algum ativo.
- **Gráficos:** o app não tem séries temporais na API, então **nenhum gráfico novo**. As barras de cota viram `sid3-meter`; a tabela "Por bucket" ganha uma barra de proporção fina na linha.
- **Estados:** carregando = skeleton do tamanho final; atualizando = dados antigos esmaecidos; erro = `sid3-error-state` (nunca o estado vazio); vazio = `sid3-empty-state` com o próximo passo.
- **Formulários:** rótulo sempre visível; validação ao sair do campo e ao enviar; botão de envio **não** fica desabilitado por campo inválido (mostra os erros); requisitos visíveis antes do erro (ex.: "6 de 12 caracteres").
- **Ações destrutivas:** `sid3-dialog` destrutivo que diz o que acontece e se é irreversível; o botão nomeia a ação.
- **Movimento:** hover/foco em 150ms, entrada de menus/toasts em 200ms, modais em 250ms, saída mais rápida; tudo desliga com `prefers-reduced-motion`.
- **Acessibilidade:** `:focus-visible` com anel azul de 2px em tudo; alvos de 44px em toque; tabelas com `<table>` semântico; modais com foco preso; contraste AA nos dois temas.

## 5. Ajustes de navegação propostos (sem telas novas)

| Grupo | Itens |
|---|---|
| Projeto | Início, Arquivos, Meu Drive, Links compartilhados, Armazenamento, **Estatísticas** (vem de Desenvolvedor) |
| Desenvolvedor | Chaves de API, Logs, Documentação da API |
| **Gerenciar** (era "Conta") | Projetos, Conexões |

- "Sair" sai da sidebar e vai para o menu do usuário.
- Cada item do menu ganha ícone, e a página ganha `<title>`.

## 6. Mensagens

- `toApiErrorMessage` continua lendo a API do mesmo jeito. Só a **apresentação** do erro muda: falha de rede (status 0)
  vira "Não foi possível falar com o servidor do SID3", 5xx vira "O servidor encontrou um erro", e o detalhe técnico fica
  recolhido em "Detalhes técnicos".
- Os textos de status são traduzidos de forma uniforme: `PENDING` → "Processando", `FAILED` → "Falhou" etc.
- O plural sai dos parênteses: "1 arquivo" e "3 arquivos", em vez de "arquivo(s)".

## 7. Implementação (Fase 3)

1. `styles/tokens.css`, `styles/base.css` (reset, foco, tipografia), fontes, ícones e `ThemeService`.
2. Componentes base da seção 3, com uma página interna de catálogo só em desenvolvimento, se você quiser.
3. Shell: sidebar, topbar, gaveta mobile, toasts e títulos de rota.
4. Telas na ordem do diagnóstico:
   1. Conexões, Início, Chaves e Logs (erro ≠ vazio, C1/C2);
   2. Cadastro e Login (C4);
   3. tabelas responsivas (C3);
   4. Armazenamento e Projetos (A2, A4);
   5. Arquivos, Meu Drive e o link público (A3);
   6. Links, Estatísticas e Docs.
5. Remover as regras antigas de `styles.css` conforme cada tela migrar, até não sobrar estilo solto.

## 8. Onde está no código

| Camada | Arquivos |
|---|---|
| Tokens (claro/escuro) | `dashboard/src/styles/tokens.css` |
| Base (reset, foco, utilitários) | `dashboard/src/styles/base.css` |
| Componentes primitivos (classes `.btn`, `.field`, `.chip`, `.card`, `.table`, `.menu`, `.modal`, `.toast`, `.state`, `.callout`…) | `dashboard/src/styles/components.css` |
| Layouts (shell, autenticação, página pública) | `dashboard/src/styles/layout.css` |
| Ícones (sprite Lucide) | `dashboard/src/index.html` + `shared/ui/icon.component.ts` |
| Componentes Angular | `shared/ui/`: `page-header`, `empty-state`, `error-state`, `skeleton`, `modal`, `confirm.service` + `confirm-host`, `menu`, `field-error`, `table-sort.ts`, `no-project-state` |
| Tema | `core/theme/theme.service.ts` (Sistema/Claro/Escuro no menu do usuário e botão na topbar) |
| Mensagens de erro | `core/api/api-error.ts` (`toApiErrorMessage`, `toApiErrorDetails`) |
| Título da aba | `core/title/page-title.strategy.ts` ("Página · SID3") |

Regras para novas telas:
- use `sid3-page-header`;
- estados com `sid3-skeleton`, `sid3-empty-state` e `sid3-error-state`;
- confirmação com `ConfirmService.ask()`, nunca `window.confirm`;
- ações de linha com `sid3-menu`;
- tabelas com `table.table.table--responsive` e `data-label` nas células;
- estilos locais só com tokens.
