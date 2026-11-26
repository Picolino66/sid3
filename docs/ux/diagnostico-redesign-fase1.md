# Diagnóstico UX do Dashboard — Fase 1 do redesign

Data: 26/11/2026 · Escopo: `dashboard/` (Angular 21, standalone, CSS global em `src/styles.css`, sem biblioteca de UI)
Método: leitura de todas as 16 telas/diálogos + navegação no app rodando (desktop 800px e celular 375px).

> Limitação: a API e o banco não estavam rodando. As telas com dados reais (tabelas cheias, pools, índice do Drive)
> foram analisadas pelo template. Os estados de erro, vazio, sem projeto, login/cadastro e mobile foram vistos no navegador.

---

## 1. Resumo executivo

O painel é funcional e bem pensado no fluxo (contexto de projeto único, guia de configuração no Início, alertas),
mas a camada visual cresceu sem design system. Os maiores riscos para o usuário são:

1. **Erro mostrado como "vazio"**: quando a API falha, o painel diz "Nenhum projeto", "Nenhuma conta conectada"
   ou "Nenhum log". Quem vê isso pode achar que perdeu os dados.
2. **Mensagens técnicas cruas** (`Http failure response for http://localhost:3000/... 0 Unknown Error`), em inglês, inclusive
   na página pública que visitantes externos veem.
3. **Mobile quebrado**: o menu vira uma grade de 3 colunas misturando títulos de grupo e links e ocupa 60% da tela.
   As tabelas viram uma coluna só, sem rótulos, e a Documentação estoura a largura (796px numa tela de 375px).
4. **Formulários que travam sem explicar**: o botão fica desabilitado e nada diz por quê. No cadastro, a senha exige
   12 caracteres e isso não aparece em lugar nenhum.
5. **Inconsistência generalizada**: 101 cores hex soltas, 18 tamanhos de fonte, 6 raios, 3 jeitos diferentes de prévia
   de arquivo e de breadcrumb, 11 confirmações destrutivas com `window.confirm` nativo, sem modo escuro, sem foco visível.

Severidade global: **alta**. Nada bloqueia o uso no desktop com a API saudável, mas o primeiro uso, o mobile e as
situações de erro passam uma impressão de produto frágil.

---

## 2. Inventário de telas

| # | Tela (rota) | Objetivo | Ações principais | Problemas |
|---|---|---|---|---|
| 1 | Login (`/login`) | Entrar | Entrar, ir para cadastro | C4, M4 |
| 2 | Cadastro (`/register`) | Criar conta | Criar conta | **C4**, M4 |
| 3 | Shell (sidebar + toasts) | Navegar, trocar de projeto, sair | Seletor de projeto, menu, Sair | **C3**, A6, A7, M5, M8 |
| 4 | Início (`/overview`) | Saúde do projeto + guia de configuração | Atualizar, seguir alertas, passos do guia | **C1**, A1, M2 |
| 5 | Arquivos (`/files`) | Navegar e enviar arquivos dos buckets do SID3 | Escolher bucket, Pastas/Recentes, Enviar, prévia → Baixar/Excluir | A2, A3, A7, M7 |
| 6 | Meu Drive (`/drive`) | Navegar no índice completo do Google Drive e compartilhar | Conta, Atualizar/Reindexar, buscar, selecionar → Gerar link, Ver/Baixar/ZIP | A3, A4, A5, **C3** (tabela) |
| 7 | Links compartilhados (`/share-links`) | Gerenciar links públicos | Copiar, Abrir, Desativar, filtro de inativos | A2, A4, **C3** (tabela) |
| 8 | Diálogo "Gerar link público" | Criar link | Nome, validade, Gerar → Copiar/Abrir | A7, M1 |
| 9 | Armazenamento (`/storage`) | Contas do projeto, buckets e pools | Adicionar/remover conta, criar/renomear/excluir bucket, destino, pools | A2, A4, M3 |
| 10 | Projetos (`/projects`) | CRUD de projetos | Criar, Abrir, Renomear, Excluir | A2, A5, M3, M8 |
| 11 | Conexões (`/connections`) | Contas Google conectadas (globais) | Conectar, Reconectar, Revogar, Excluir, resolver pasta sid3, renomear | **C1**, **C2**, A4, **C3** (tabela) |
| 12 | Callback Google (`/connections/google/callback`) | Concluir OAuth | — | C2 |
| 13 | Chaves de API (`/api-keys`) | Criar/renovar/revogar chaves | Criar, Copiar segredo, Renovar, Revogar | A5, A6, A2 |
| 14 | Logs (`/logs`) | Auditar operações | Limite, Atualizar | **C1**, A8 |
| 15 | Estatísticas (`/stats`) | Uso por conexão e por bucket | — (só leitura) | A1, A6, M2 |
| 16 | Documentação da API (`/docs`) | Guia de integração | Abas de linguagem, sumário | **C3**, M6 |
| 17 | Link público (`/s/:token`) | Visitante vê e baixa itens | Buscar, abrir pasta, Ver/Reproduzir, Baixar, ZIP | **C2**, A3 |
| 18 | Visualizador de mídia público | Ver imagem/vídeo/áudio (inclui MPEG-TS) | Navegar, play, tela cheia, baixar | A7 |

---

## 3. Problemas priorizados

### 🔴 Crítico

**C1 — Falha de carregamento aparece como estado vazio**
- Onde: todas as telas de projeto (Início, Arquivos, Drive, Armazenamento, Links…), Conexões, Logs, Chaves.
- O que acontece: se `GET /projects` falha, `ProjectContextService` marca como carregado e as telas mostram
  "Nenhum projeto selecionado → Criar projeto". Em Conexões aparecem **ao mesmo tempo** o erro e "Nenhuma conta
  conectada ainda". Logs diz "Nenhum log para este projeto ainda" sem haver projeto.
- Impacto: o usuário acha que perdeu dados, cria projetos ou conexões duplicados e não tenta de novo, porque não há
  "Tentar novamente".

**C2 — Mensagens de erro técnicas, em inglês, com URL interna**
- Onde: em toda tela que usa `toApiErrorMessage` (cai em `error.message` do Angular ou em "Unexpected error") e na página pública `/s/:token`.
- Impacto: o usuário não sabe o que fazer, e o endereço interno da API aparece para visitantes externos. Isso quebra a
  confiança justamente no link compartilhado.

**C3 — Layout móvel quebrado**
- Onde: shell e todas as tabelas (Conexões, Chaves, Logs, Drive, Links, link público), além da Documentação.
- O que acontece:
  - abaixo de 860px a sidebar vira uma grade de 3 colunas, os rótulos de grupo ocupam células e "Armazenamento" estoura
    a largura;
  - o conteúdo só começa em y=509px de 812px, e não há menu recolhível;
  - as tabelas viram `1fr`: o cabeçalho empilha como se fosse uma linha e as células perdem o rótulo;
  - a Documentação força um viewport de 796px por causa dos blocos `<pre>`.
- Impacto: o painel fica praticamente inutilizável no celular, inclusive o link público, que é aberto por terceiros
  muitas vezes no telefone.

**C4 — Formulários bloqueiam sem explicar (validação invisível)**
- Onde: Cadastro (senha ≥ 12 caracteres, regra não exibida), Login, Projetos, Buckets, Pools e Chaves.
- O que acontece: o botão de envio fica `disabled` até o formulário ficar válido, e nenhuma mensagem inline diz o que
  falta. Os campos não têm estado de erro.
- Impacto: trava a jornada 1 (primeiro upload) já na criação da conta, e o usuário fica achando que o botão "não funciona".

### 🟠 Alto

**A1 — Carregamento sem skeleton, com "pulos" de layout**
- Onde: Início, Armazenamento, Estatísticas, Logs, Chaves, Conexões, Arquivos e Drive.
- O que acontece: cada tela tem seu "Carregando…" em texto solto. Estatísticas apaga tudo a cada recarga. O botão
  "Atualizar" troca de texto e muda de largura.
- Impacto: a tela parece em branco e lenta, e o conteúdo muda de posição.

**A2 — Ações destrutivas confirmadas por `window.confirm` nativo (11 lugares)**
- Onde: excluir arquivo (apaga também do Drive), excluir projeto/bucket/pool/conexão, revogar e renovar chave,
  desativar link e remover conta do projeto.
- O que acontece: o diálogo do navegador não segue o visual do app, não destaca o que é irreversível e é confirmado no
  automático. O app já tem modais próprios (Conexões, prévia) que não são reaproveitados aqui.
- Impacto: risco real de perda de dados por hábito de clicar em "OK".

**A3 — Três padrões diferentes para "navegar em arquivos"**
- Onde: Arquivos (grade de miniaturas, breadcrumb de botões azuis, prévia com "Fechar" no topo e Excluir/Baixar
  embaixo), Meu Drive (tabela, breadcrumb de links verdes, prévia com Fechar/Baixar embaixo) e Link público (tabela,
  visualizador com ✕).
- O que acontece: os nomes "Arquivos" e "Meu Drive" não deixam claro a diferença entre "o que o SID3 guarda" e "todo o
  Google Drive".
- Impacto: o usuário precisa reaprender a cada tela e não sabe onde procurar um arquivo.

**A4 — Excesso de ações por linha e ações escondidas**
- Onde e o que acontece:
  - Conexões: até 4 botões por linha (Resolver pasta, Reconectar, Revogar, Excluir), e renomear **só com duplo clique**
    (só uma dica no `title` avisa);
  - Meu Drive: até 4 ações por linha;
  - Pools: um `<select>` que **executa a ação** ao mudar ("+ Adicionar conta");
  - Buckets e Projetos: renomear vira input que **salva ao perder o foco** (blur);
  - destino do bucket: um select que dispara a mudança na hora.
- Impacto: carga de decisão alta (Hick), funções que ninguém descobre e alterações acidentais.

**A5 — Hierarquia de botões incoerente**
- O que acontece:
  - o verde primário aparece em ações secundárias ("Renovar" chave ao lado de "Revogar"; "Abrir" projeto);
  - o `.secondary` é azul-marinho preenchido, visualmente mais pesado que o primário;
  - "Excluir" vermelho preenchido se repete em toda linha;
  - "Atualizar" é primário em Logs e Drive, mas secundário no Início.
- Impacto: o olho não encontra a ação principal da tela, e o vermelho repetido gera ruído e alarme.

**A6 — Contexto do projeto e cabeçalhos inconsistentes**
- O que acontece:
  - algumas telas mostram o nome do projeto no eyebrow (Arquivos, Drive, Armazenamento) e outras não (Chaves, Logs,
    Estatísticas);
  - Chaves mostra o projeto duas vezes e, sem projeto, exibe um formulário com "Projeto: —" em vez do estado "sem
    projeto";
  - 9 rotas não têm `title` (a aba fica "SID3 Dashboard").
- Impacto: o usuário não tem certeza de em qual projeto está agindo, e isso pesa em ações como revogar chaves.

**A7 — Acessibilidade abaixo de AA**
- O que acontece:
  - não há estilo de `:focus-visible` (só 2 regras de foco no CSS inteiro);
  - os rótulos de grupo do menu têm contraste de cerca de 2,6:1 (`#4a5a68` sobre `#111820`);
  - emojis servem de ícone (📁 🗄️ ▶ 📄);
  - os modais não prendem o foco e o Esc funciona só em alguns;
  - todo toast usa `role="alert"`, até os de sucesso;
  - não há suporte a `prefers-reduced-motion` nem modo escuro.
- Impacto: fica difícil usar pelo teclado e por leitores de tela, e a leitura cansa em telas escuras.

**A8 — Logs pouco úteis para diagnóstico (jornada 4)**
- O que acontece:
  - bucket, objeto e requisição aparecem como IDs truncados;
  - o `errorCode`, que já vem nos dados, não é exibido;
  - o único controle é um campo numérico "Limite", sem filtro por status ou operação sobre os dados carregados.
- Impacto: o usuário não consegue responder "o que falhou e por quê" sem abrir outra ferramenta.

### 🟡 Médio

**M1 — Sem design system nem tokens.**
- 101 cores hex, 18 tamanhos de fonte e raios de 4/6/8/10px.
- Regras duplicadas e conflitantes: `.drive-table` definida 3 vezes, `.media-viewer-content` 4 vezes, `.secondary-link` 2 vezes com cores diferentes.
- A Documentação tem uma paleta própria em `styles`.
- O status "Indexando…" usa a classe `.error` (laranja). "Revogada" e "Falha" têm o mesmo vermelho.

**M2 — Redundância e terminologia.**
- Início e Estatísticas repetem KPIs (Arquivos, Espaço).
- O mesmo conceito tem nomes diferentes: "Drives conectados", "Contas do Drive no projeto", "conexão", "conta" e "GOOGLE_DRIVE" (este como nome de fallback).
- Plural com parênteses: "bucket(s)", "arquivo(s)".
- O status de arquivo aparece cru em inglês (`PENDING`, `FAILED`) em Arquivos.

**M3 — Formulários inline sem rótulo visível.** Criar projeto, bucket e pool usam só placeholder. O formulário de criar projeto fica num painel sem título acima da lista. "Criar pool" não tem estado de carregamento.

**M4 — Login e Cadastro.** O título fica colado no primeiro rótulo, sem respiro. O eyebrow "Dashboard" não acrescenta nada. Falta mostrar/ocultar senha e um indicador de requisitos.

**M5 — Toasts.** Ficam no canto superior direito, por cima das ações do topo. Não têm ícone nem animação real de entrada e saída.

**M6 — Documentação.**
- Instruções desatualizadas: fala do menu "Buckets", que agora fica em Armazenamento, e do botão "Novo projeto", que hoje é "Criar projeto".
- O sumário usa `href="javascript:void(0)"`.
- Os blocos de código não têm botão de copiar.
- A URL base é um exemplo fixo.

**M7 — Estados vazios desiguais.** Alguns são painéis com CTA, outros um texto solto sem orientação. Exemplo: "Nenhum bucket neste projeto." aparece com o formulário de criação escondido no rodapé do painel.

**M8 — Arquitetura do menu.**
- "Projetos" fica no grupo "Conta", embora o seletor de projeto esteja no topo.
- "Estatísticas" fica em "Desenvolvedor", embora seja uso do projeto.
- "Sair" é um botão grande no fim da lista, e não existe menu de usuário.
- O seletor de projeto é um `<select>` nativo escuro.

---

## 4. Análise cognitiva (resumo)

| Heurística | Achado |
|---|---|
| Visibilidade do estado (Nielsen 1) | Erro mostrado como vazio (C1); carregamento só em texto (A1) |
| Reconhecer em vez de lembrar | Renomear por duplo clique, Enter/blur para salvar (A4) |
| Lei de Hick | 4 ações por linha em Conexões e Drive; 3 painéis com formulários inline em Armazenamento |
| Information scent | "Arquivos" × "Meu Drive"; Armazenamento junta contas, buckets e pools |
| Previsibilidade | Selects que executam ação ao mudar; blur que salva (A4) |
| Prevenção de erros | `window.confirm` para ações irreversíveis (A2); validação invisível (C4) |
| Consistência (Jakob) | 3 padrões de prévia e breadcrumb (A3); hierarquia de botões (A5) |
| Mensagens de erro (Nielsen 9) | Texto técnico em inglês com URL (C2) |

O que já funciona bem e deve ser preservado:
- o seletor de projeto único;
- o guia de configuração com checklist no Início;
- os alertas com link direto para a correção;
- a barra de seleção persistente no Drive;
- o banner de segredo "exibido uma única vez";
- os textos de apoio em português claro.

---

## 5. Roadmap sugerido (alimenta as Fases 2 e 3)

- **Quick wins:** tokens de cor/tipo/espaço; mensagens de erro amigáveis com "Tentar novamente"; separar erro de vazio;
  títulos de página; foco visível; requisitos de senha visíveis.
- **Melhorias médias:** modal de confirmação próprio; skeletons; validação inline; tabela responsiva (cards no mobile)
  com busca/ordenação nos dados já carregados; menu de ações por linha; renomear com botão explícito.
- **Estruturais:** novo shell (sidebar recolhível e drawer no mobile, topbar com projeto e usuário); componentes únicos
  de prévia de arquivo e breadcrumb usados em Arquivos, Drive e no link público; modo claro/escuro.

Fora do escopo (contrato e lógica não mudam): novas telas, novos endpoints e paginação no servidor para Logs.
