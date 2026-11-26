# Redesign do dashboard: antes e depois (Fase 4)

Data: 26/11/2026 · Branch: `feat/redesign-dashboard` · Base: [diagnóstico da Fase 1](diagnostico-redesign-fase1.md) ·
Design system: [design-system.md](design-system.md) · Capturas: [qa-fase4/](qa-fase4/index.html)

## 1. Resumo

O painel saiu de um CSS global sem padrão (1.891 linhas, 101 cores soltas, 18 tamanhos de fonte) para um design
system com tokens de claro e escuro, componentes reutilizáveis e um novo shell responsivo. Todas as 18 telas e diálogos
foram migrados.

Restrições cumpridas:
- nenhum serviço HTTP, endpoint, modelo de dados ou regra de permissão foi alterado;
- nenhuma tela ou funcionalidade nova foi criada.

| Indicador | Antes | Depois |
|---|---|---|
| Cores definidas | 101 hex espalhados | 18 tokens × 2 temas, em um arquivo; **0** fora dele |
| Tamanhos de fonte | 18 | escala de 7 tokens |
| Modo escuro | não havia | completo, seguindo o sistema ou fixado pelo usuário |
| Confirmações destrutivas | 11 × `window.confirm` | 0, todas no diálogo do painel |
| Emojis como ícone | 6 tipos | 0, todos em sprite SVG local |
| Telas com título na aba | 5 de 14 | 14 de 14 ("Página · SID3") |
| Erro de carregamento mostrado como "vazio" | 6 telas | 0 |
| Rolagem lateral em 375px | shell e 7 tabelas, Docs com 796px | 0 telas (medido) |
| Regras de foco visível | 2 | global (`:focus-visible`) |

## 2. Validação (QA)

**Como foi feita:** a API real não estava disponível (porta 3000 e Postgres ocupados por outro projeto). O Playwright
abriu o dashboard e respondeu às chamadas da API com dados fictícios dentro do próprio navegador de teste, sem mudar
código nem configuração.

**O que foi capturado:** 88 capturas em [qa-fase4/](qa-fase4/index.html):
- as 14 telas em desktop (1440px) e celular (375px), nos modos claro e escuro;
- os estados vazio, sem projeto e com erro (API fora do ar);
- as interações: menu de ações aberto, confirmação destrutiva, validação de formulário, seleção em lote, seletor de
  projeto e gaveta do celular.

| Verificação automática (em cada captura) | 1ª rodada | Após correções |
|---|---|---|
| Rolagem lateral | 0 | 0 |
| Texto abaixo de AA (4,5:1; 3:1 em texto grande) | 2 (chip neutro, 4,31:1) | 0 |
| Botões ou links sem nome acessível | 1 | 0 |
| Imagens sem `alt` / emojis como ícone | 0 / 0 | 0 / 0 |
| Erros de console | 0 | 0 |
| Título da aba | 14 de 14 | 14 de 14 |

**Foco por teclado:** percorri cada tela com Tab. Todos os elementos têm anel de foco visível: 2px de contorno em botões e
links, e anel de sombra nos campos. A auditoria automática apontou a marca da sidebar e o menu de conta, mas a
checagem manual com o Tab confirmou que o anel aparece; foi falso positivo de tempo.

**Correções feitas a partir das capturas:**
- contraste do chip neutro;
- regra dos KPIs no celular (2 colunas, sem ícones e sem buraco quando a quantidade é ímpar);
- passos do guia de configuração quebrando linha no celular;
- "Nenhum envio ainda" no lugar de "Nenhuma falha" quando não houve envios (sem falso "tudo certo");
- botão duplicado no Armazenamento vazio;
- barra de busca e ZIP da página pública numa linha só;
- menu das Chaves no canto do cartão no celular;
- card do guia com a largura da página;
- avatar com fonte de 10px trocado por uma variante do design system.

Antes disso, na Fase 3, a mesma revisão já tinha corrigido selects mostrando a opção errada, ícone de busca fora do
campo e rolagem lateral em Meu Drive e Arquivos.

**Build e testes (final):** build de produção ✅, `npm run lint` (build de desenvolvimento) ✅, typecheck ✅,
testes unitários 10/10 ✅. Bundle inicial: 357 kB (99 kB comprimido).

## 3. Reanálise de carga cognitiva (comparada à Fase 1)

| # | Problema da Fase 1 | Situação | O que mudou |
|---|---|---|---|
| C1 | Erro aparecia como estado vazio | ✅ Resolvido | Erro e vazio são estados separados em todas as telas, inclusive no seletor da sidebar. |
| C2 | Mensagens técnicas em inglês, com URL | ✅ Resolvido | Mensagens em português, com o detalhe técnico recolhido. A página pública explica o motivo (link expirado, conta desconectada). |
| C3 | Celular quebrado | ✅ Resolvido | Gaveta de navegação, tabelas viram cartões com rótulos, KPIs em 2 colunas. |
| C4 | Validação invisível | ✅ Resolvido | Erros junto ao campo e botão de enviar sempre ativo. O cadastro mostra "N de 12 caracteres" e os campos de senha têm mostrar/ocultar. |
| A1 | "Carregando…" solto | ✅ Resolvido | Skeleton no formato final. Ao atualizar, os dados antigos ficam esmaecidos em vez de sumir. |
| A2 | `window.confirm` | ✅ Resolvido | Diálogo do painel que diz o que acontece e se é irreversível; o botão nomeia a ação. |
| A3 | Três jeitos de navegar em arquivos | 🟡 Parcial | Mesmo breadcrumb, mesmo modal de prévia, mesmos ícones e descrição em cada tela. Arquivos continua em grade e Meu Drive em tabela, porque servem a objetivos diferentes. Não foi criado um componente único de prévia. |
| A4 | Ações demais por linha e ações escondidas | ✅ Resolvido | Menu "⋯" com no máximo um atalho visível. Renomear é explícito (modal ou campo com Salvar). Os selects que executavam ação viraram menus. O destino do bucket continua um select, mas agora pede confirmação. |
| A5 | Hierarquia de botões incoerente | ✅ Resolvido | Um botão primário por cabeçalho, secundário em contorno, vermelho só em menus e confirmações. |
| A6 | Contexto do projeto inconsistente | ✅ Resolvido | Breadcrumb "Projeto › Página", cabeçalho padrão e estado "sem projeto" em todas as telas de projeto. |
| A7 | Acessibilidade abaixo de AA | ✅ Resolvido* | Contraste verificado automaticamente, foco visível, modais com foco preso e Esc, `role` correto nos toasts, ícones com rótulo e `prefers-reduced-motion`. *Teste com leitor de tela real ainda não feito. |
| A8 | Logs pouco úteis | 🟡 Parcial | Busca, filtro por resultado e por operação, código de erro visível e IDs copiáveis. Bucket e objeto continuam como ID, porque mostrar nomes exigiria uma chamada de API nova. |
| M1 | Sem design system | ✅ Resolvido | Tokens, primitivas e componentes Angular. Sem estilo solto fora deles. |
| M2 | Terminologia e redundância | 🟡 Parcial | Nomes unificados ("Espaço usado", "Arquivos", "Contas do Drive"), status traduzidos e plural correto. Início e Estatísticas ainda repetem dois totais, de propósito: Estatísticas é o detalhamento. |
| M3 | Campos sem rótulo | ✅ Resolvido | Rótulo visível em todos os formulários. |
| M4 | Login e Cadastro | ✅ Resolvido | Espaçamento, mostrar/ocultar senha e requisitos visíveis. |
| M5 | Toasts | ✅ Resolvido | Com ícone e animação; não cobrem mais as ações do topo. |
| M6 | Documentação | 🟡 Parcial | Textos corrigidos, sumário com âncoras reais, abas acessíveis e sem rolagem lateral. Faltam o botão de copiar nos blocos de código e a URL base real. |
| M7 | Estados vazios desiguais | ✅ Resolvido | `sid3-empty-state` padrão, com o próximo passo. |
| M8 | Arquitetura do menu | ✅ Resolvido | Grupos Projeto, Desenvolvedor e Gerenciar, com ícones; Sair foi para o menu do usuário. |

**Heurísticas, antes e depois:**

| Heurística | Antes | Depois |
|---|---|---|
| Visibilidade do estado | Erro confundido com vazio; carregamento só em texto | Três estados distintos, skeleton e chips de status |
| Reconhecer em vez de lembrar | Duplo clique e blur para salvar | Ações nomeadas em menus, com ícone |
| Lei de Hick | Até 4 botões por linha | 1 atalho + menu "⋯" |
| Prevenção de erros | `window.confirm` e validação invisível | Diálogo explícito e erros inline |
| Consistência | 3 breadcrumbs, 3 prévias, 8 variantes de tabela | 1 de cada |
| Mensagens de erro | Texto técnico | Linguagem simples + Tentar novamente |

## 4. Pendências

1. **Validar com a API real e o Google** (OAuth, upload com progresso, prévia de PDF e MPEG-TS, download de ZIP). A QA
   desta fase usou dados fictícios interceptados no navegador.
2. **Leitor de tela** (NVDA ou Orca) nos fluxos principais: criar chave, excluir arquivo, gerar link.
3. Melhorias que ficaram parciais:
   - um componente único de prévia de arquivo (A3);
   - botão de copiar nos blocos de código da Documentação (M6);
   - nomes de bucket nos Logs, que dependem de decisão sobre uma chamada extra de API (A8).
4. **Fontes pelo Google Fonts:** a escolha foi aprovada. Se preferir não depender de requisição externa, dá para hospedar
   as fontes no próprio app.
5. **Nada commitado.** Decidir se as capturas em `docs/ux/qa-fase4/` entram no repositório e se `.claude/launch.json`
   fica.
