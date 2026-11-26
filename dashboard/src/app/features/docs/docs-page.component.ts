import { AfterViewInit, ChangeDetectionStrategy, Component, OnDestroy, signal } from '@angular/core';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

type Lang = 'curl' | 'js' | 'python' | 'csharp';

const BASE_URL = 'https://sua-api.exemplo.com/api/v1';

interface TocItem {
  id: string;
  label: string;
  group?: 'Referência';
}

@Component({
  selector: 'sid3-docs-page',
  imports: [PageHeaderComponent],
  template: `
    <sid3-page-header title="Documentação da API" description="Como enviar, listar, baixar e excluir arquivos pelo SID3 com uma chave de API." />

    <div class="docs-layout">

      <!-- Conteúdo principal -->
      <div class="docs-main">

        <!-- URL base -->
        <section id="url-base" class="card card__body doc-section">
          <header>
            <h2>URL base</h2>
            <p>
              Todas as requisições usam a URL abaixo como prefixo. Substitua pelo endereço
              da sua instalação do SID3.
            </p>
          </header>
          <pre class="code-block"><code>https://sua-api.exemplo.com/api/v1</code></pre>
        </section>

        <!-- Início Rápido -->
        <section id="quickstart" class="card card__body doc-section">
          <header>
            <h2>Início Rápido</h2>
            <p>Quatro passos para começar a usar o SID3 como camada de armazenamento.</p>
          </header>
          <ol class="quickstart-steps">
            <li>
              <strong>1. Crie um projeto</strong>
              <span>No menu lateral, acesse <em>Projetos</em> e clique em <strong>Novo projeto</strong>. O projeto é o agrupador de todos os seus recursos.</span>
            </li>
            <li>
              <strong>2. Conecte um Google Drive</strong>
              <span>Em <em>Conexões</em>, clique em <strong>Conectar Google Drive</strong> e autorize o acesso. Cada conta Google conectada vira uma fonte de armazenamento disponível.</span>
            </li>
            <li>
              <strong>3. Crie um bucket e gere uma chave de API</strong>
              <span>Em <em>Armazenamento</em>, adicione a conta do Drive ao projeto e crie um bucket. Em <em>Chaves de API</em>, gere um segredo — ele é exibido <strong>uma única vez</strong>.</span>
            </li>
            <li>
              <strong>4. Faça o primeiro upload</strong>
              <span>Liste seus buckets com <code>GET /buckets</code> para obter o <code>BUCKET_ID</code>, depois use <code>POST /buckets/&#123;BUCKET_ID&#125;/objects</code> com o header <code>X-SID3-API-Key</code>.</span>
            </li>
          </ol>
        </section>

        <!-- Autenticação -->
        <section id="autenticacao" class="card card__body doc-section">
          <header>
            <h2>Autenticação</h2>
            <p>
              Operações de arquivo usam <strong>somente a Chave de API</strong> no header
              <code>X-SID3-API-Key</code> — não é necessário fazer login nem enviar JWT.
              A chave representa o acesso programático ao projeto e funciona diretamente
              de qualquer cliente HTTP (servidor, script, app mobile).
            </p>
            <p>
              Gere a chave em <em>Chaves de API</em> dentro do seu projeto no dashboard.
              O valor secreto é exibido <strong>uma única vez</strong> ao criar — guarde-o
              em uma variável de ambiente ou cofre de segredos.
            </p>
          </header>
          <pre class="code-block"><code>X-SID3-API-Key: <span class="code-var">SUA_CHAVE_DE_API</span></code></pre>
        </section>

        <!-- Listar buckets -->
        <section id="listar-buckets" class="card card__body doc-section">
          <header>
            <div class="endpoint-line">
              <span class="method get">GET</span>
              <code class="endpoint-path">/buckets</code>
            </div>
            <h2>Listar buckets</h2>
            <p>
              Retorna todos os buckets do projeto associado à sua API Key.
              Use este endpoint para obter o <code>BUCKET_ID</code> necessário nas demais operações.
            </p>
          </header>

          <div class="tabs lang-tabs" role="tablist" aria-label="Linguagem do exemplo">
            @for (tab of tabs; track tab.id) {
              <button type="button" role="tab" [attr.aria-selected]="lang('list-buckets') === tab.id" (click)="setLang('list-buckets', tab.id)">{{ tab.label }}</button>
            }
          </div>

          @if (lang('list-buckets') === 'curl') {
            <pre class="code-block"><code>curl "${BASE_URL}/buckets" \\
  -H "X-SID3-API-Key: <span class="code-var">SUA_CHAVE_DE_API</span>"</code></pre>
          }
          @if (lang('list-buckets') === 'js') {
            <pre class="code-block"><code>const resposta = await fetch(
  '${BASE_URL}/buckets',
  &#123; headers: &#123; 'X-SID3-API-Key': '<span class="code-var">SUA_CHAVE_DE_API</span>' &#125; &#125;
);
const buckets = await resposta.json();</code></pre>
          }
          @if (lang('list-buckets') === 'python') {
            <pre class="code-block"><code>import requests

r = requests.get(
    '${BASE_URL}/buckets',
    headers=&#123;'X-SID3-API-Key': '<span class="code-var">SUA_CHAVE_DE_API</span>'&#125;
)
buckets = r.json()</code></pre>
          }
          @if (lang('list-buckets') === 'csharp') {
            <pre class="code-block"><code>using var http = new HttpClient();
http.DefaultRequestHeaders.Add("X-SID3-API-Key", "<span class="code-var">SUA_CHAVE_DE_API</span>");

var resp = await http.GetAsync("${BASE_URL}/buckets");
var json = await resp.Content.ReadAsStringAsync();</code></pre>
          }

          <p class="response-label">Resposta — <code>200 OK</code></p>
          <pre class="code-block"><code>[
  &#123;
    "id": "<span class="code-var">4d6c6358-156f-4c58-9d85-faf1195b0fab</span>",
    "name": "facebook-instagram",
    "projectId": "a1b2c3d4-...",
    "providerIntegrationId": "e5f6g7h8-...",
    "storagePoolId": null,
    "createdAt": "2026-05-31T14:37:00Z"
  &#125;,
  &#123;
    "id": "<span class="code-var">128ac4b9-01d5-46b6-8602-b6a890de510b</span>",
    "name": "pools",
    "projectId": "a1b2c3d4-...",
    "providerIntegrationId": null,
    "storagePoolId": "c9d0e1f2-...",
    "createdAt": "2026-05-31T14:46:00Z"
  &#125;
]</code></pre>
        </section>

        <!-- Upload -->
        <section id="upload" class="card card__body doc-section">
          <header>
            <div class="endpoint-line">
              <span class="method post">POST</span>
              <code class="endpoint-path">/buckets/<span class="code-var-inline">BUCKET_ID</span>/objects</code>
            </div>
            <h2>Enviar arquivo</h2>
            <p>Envia um arquivo via <code>multipart/form-data</code>. O campo <code>key</code> define o caminho virtual do arquivo (ex: <code>avatares/foto.png</code>).</p>
          </header>

          <div class="tabs lang-tabs" role="tablist" aria-label="Linguagem do exemplo">
            @for (tab of tabs; track tab.id) {
              <button type="button" role="tab" [attr.aria-selected]="lang('upload') === tab.id" (click)="setLang('upload', tab.id)">{{ tab.label }}</button>
            }
          </div>

          @if (lang('upload') === 'curl') {
            <pre class="code-block"><code># BUCKET_ID: obtido via GET /buckets
curl -X POST ${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects \\
  -H "X-SID3-API-Key: <span class="code-var">SUA_CHAVE_DE_API</span>" \\
  -F "key=avatares/foto.png" \\
  -F "file=@/caminho/para/arquivo.png"</code></pre>
          }
          @if (lang('upload') === 'js') {
            <pre class="code-block"><code>const form = new FormData();
form.append('key', 'avatares/foto.png');
form.append('file', arquivo); // objeto File do input

const resposta = await fetch(
  '${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects',
  &#123;
    method: 'POST',
    headers: &#123; 'X-SID3-API-Key': '<span class="code-var">SUA_CHAVE_DE_API</span>' &#125;,
    body: form
  &#125;
);
const objeto = await resposta.json();</code></pre>
          }
          @if (lang('upload') === 'python') {
            <pre class="code-block"><code>import requests

with open('arquivo.png', 'rb') as f:
    r = requests.post(
        '${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects',
        headers=&#123;'X-SID3-API-Key': '<span class="code-var">SUA_CHAVE_DE_API</span>'&#125;,
        files=&#123;'file': f&#125;,
        data=&#123;'key': 'avatares/foto.png'&#125;
    )
print(r.json())</code></pre>
          }
          @if (lang('upload') === 'csharp') {
            <pre class="code-block"><code>using var http = new HttpClient();
http.DefaultRequestHeaders.Add("X-SID3-API-Key", "<span class="code-var">SUA_CHAVE_DE_API</span>");

using var form = new MultipartFormDataContent();
form.Add(new StringContent("avatares/foto.png"), "key");
form.Add(new StreamContent(File.OpenRead("arquivo.png")), "file", "arquivo.png");

var resp = await http.PostAsync(
    "${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects",
    form
);
var json = await resp.Content.ReadAsStringAsync();</code></pre>
          }

          <p class="response-label">Resposta — <code>201 Created</code></p>
          <pre class="code-block"><code>&#123;
  "id": "3f2a1b4c-...",
  "key": "avatares/foto.png",
  "fileName": "foto.png",
  "contentType": "image/png",
  "sizeBytes": 204800,
  "status": "AVAILABLE",
  "createdAt": "2026-01-15T10:30:00Z"
&#125;</code></pre>
        </section>

        <!-- Listar arquivos -->
        <section id="listar-arquivos" class="card card__body doc-section">
          <header>
            <div class="endpoint-line">
              <span class="method get">GET</span>
              <code class="endpoint-path">/buckets/<span class="code-var-inline">BUCKET_ID</span>/objects</code>
            </div>
            <h2>Listar arquivos</h2>
            <p>
              Retorna todos os objetos do bucket. Use o parâmetro <code>?prefix=pasta/</code>
              para filtrar por prefixo de caminho (equivalente a listar uma "pasta").
            </p>
          </header>

          <div class="tabs lang-tabs" role="tablist" aria-label="Linguagem do exemplo">
            @for (tab of tabs; track tab.id) {
              <button type="button" role="tab" [attr.aria-selected]="lang('list') === tab.id" (click)="setLang('list', tab.id)">{{ tab.label }}</button>
            }
          </div>

          @if (lang('list') === 'curl') {
            <pre class="code-block"><code>curl "${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects?prefix=avatares/" \\
  -H "X-SID3-API-Key: <span class="code-var">SUA_CHAVE_DE_API</span>"</code></pre>
          }
          @if (lang('list') === 'js') {
            <pre class="code-block"><code>const resposta = await fetch(
  '${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects?prefix=avatares/',
  &#123; headers: &#123; 'X-SID3-API-Key': '<span class="code-var">SUA_CHAVE_DE_API</span>' &#125; &#125;
);
const &#123; items &#125; = await resposta.json();</code></pre>
          }
          @if (lang('list') === 'python') {
            <pre class="code-block"><code>import requests

r = requests.get(
    '${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects',
    headers=&#123;'X-SID3-API-Key': '<span class="code-var">SUA_CHAVE_DE_API</span>'&#125;,
    params=&#123;'prefix': 'avatares/'&#125;
)
itens = r.json()['items']</code></pre>
          }
          @if (lang('list') === 'csharp') {
            <pre class="code-block"><code>using var http = new HttpClient();
http.DefaultRequestHeaders.Add("X-SID3-API-Key", "<span class="code-var">SUA_CHAVE_DE_API</span>");

var resp = await http.GetAsync(
    "${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects?prefix=avatares/"
);
var json = await resp.Content.ReadAsStringAsync();</code></pre>
          }

          <p class="response-label">Resposta — <code>200 OK</code></p>
          <pre class="code-block"><code>&#123;
  "items": [
    &#123;
      "id": "3f2a1b4c-...",
      "key": "avatares/foto.png",
      "fileName": "foto.png",
      "contentType": "image/png",
      "sizeBytes": 204800,
      "status": "AVAILABLE",
      "createdAt": "2026-01-15T10:30:00Z"
    &#125;
  ],
  "total": 1
&#125;</code></pre>
        </section>

        <!-- Download -->
        <section id="download" class="card card__body doc-section">
          <header>
            <div class="endpoint-line">
              <span class="method get">GET</span>
              <code class="endpoint-path">/buckets/<span class="code-var-inline">BUCKET_ID</span>/objects/<span class="code-var-inline">OBJECT_ID</span>/download</code>
            </div>
            <h2>Baixar arquivo</h2>
            <p>Retorna o conteúdo binário do arquivo com os headers <code>Content-Type</code> e <code>Content-Disposition</code> corretos. O <code>OBJECT_ID</code> é retornado no campo <code>"id"</code> do upload.</p>
          </header>

          <div class="tabs lang-tabs" role="tablist" aria-label="Linguagem do exemplo">
            @for (tab of tabs; track tab.id) {
              <button type="button" role="tab" [attr.aria-selected]="lang('download') === tab.id" (click)="setLang('download', tab.id)">{{ tab.label }}</button>
            }
          </div>

          @if (lang('download') === 'curl') {
            <pre class="code-block"><code>curl "${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects/<span class="code-var">OBJECT_ID</span>/download" \\
  -H "X-SID3-API-Key: <span class="code-var">SUA_CHAVE_DE_API</span>" \\
  -o arquivo-baixado.png</code></pre>
          }
          @if (lang('download') === 'js') {
            <pre class="code-block"><code>const resposta = await fetch(
  '${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects/<span class="code-var">OBJECT_ID</span>/download',
  &#123; headers: &#123; 'X-SID3-API-Key': '<span class="code-var">SUA_CHAVE_DE_API</span>' &#125; &#125;
);
const blob = await resposta.blob();
const url = URL.createObjectURL(blob);
// use a URL para exibir ou iniciar o download</code></pre>
          }
          @if (lang('download') === 'python') {
            <pre class="code-block"><code>import requests

r = requests.get(
    '${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects/<span class="code-var">OBJECT_ID</span>/download',
    headers=&#123;'X-SID3-API-Key': '<span class="code-var">SUA_CHAVE_DE_API</span>'&#125;,
    stream=True
)
with open('arquivo-baixado.png', 'wb') as f:
    for chunk in r.iter_content(8192):
        f.write(chunk)</code></pre>
          }
          @if (lang('download') === 'csharp') {
            <pre class="code-block"><code>using var http = new HttpClient();
http.DefaultRequestHeaders.Add("X-SID3-API-Key", "<span class="code-var">SUA_CHAVE_DE_API</span>");

var bytes = await http.GetByteArrayAsync(
    "${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects/<span class="code-var">OBJECT_ID</span>/download"
);
await File.WriteAllBytesAsync("arquivo-baixado.png", bytes);</code></pre>
          }
        </section>

        <!-- Excluir -->
        <section id="delete" class="card card__body doc-section">
          <header>
            <div class="endpoint-line">
              <span class="method delete">DELETE</span>
              <code class="endpoint-path">/buckets/<span class="code-var-inline">BUCKET_ID</span>/objects/<span class="code-var-inline">OBJECT_ID</span></code>
            </div>
            <h2>Excluir arquivo</h2>
            <p>Remove o arquivo do bucket e do Google Drive. A operação é idempotente — excluir um arquivo já removido retorna sucesso.</p>
          </header>

          <div class="tabs lang-tabs" role="tablist" aria-label="Linguagem do exemplo">
            @for (tab of tabs; track tab.id) {
              <button type="button" role="tab" [attr.aria-selected]="lang('delete') === tab.id" (click)="setLang('delete', tab.id)">{{ tab.label }}</button>
            }
          </div>

          @if (lang('delete') === 'curl') {
            <pre class="code-block"><code>curl -X DELETE \\
  "${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects/<span class="code-var">OBJECT_ID</span>" \\
  -H "X-SID3-API-Key: <span class="code-var">SUA_CHAVE_DE_API</span>"</code></pre>
          }
          @if (lang('delete') === 'js') {
            <pre class="code-block"><code>await fetch(
  '${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects/<span class="code-var">OBJECT_ID</span>',
  &#123;
    method: 'DELETE',
    headers: &#123; 'X-SID3-API-Key': '<span class="code-var">SUA_CHAVE_DE_API</span>' &#125;
  &#125;
);</code></pre>
          }
          @if (lang('delete') === 'python') {
            <pre class="code-block"><code>import requests

requests.delete(
    '${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects/<span class="code-var">OBJECT_ID</span>',
    headers=&#123;'X-SID3-API-Key': '<span class="code-var">SUA_CHAVE_DE_API</span>'&#125;
)</code></pre>
          }
          @if (lang('delete') === 'csharp') {
            <pre class="code-block"><code>using var http = new HttpClient();
http.DefaultRequestHeaders.Add("X-SID3-API-Key", "<span class="code-var">SUA_CHAVE_DE_API</span>");

await http.DeleteAsync(
    "${BASE_URL}/buckets/<span class="code-var">BUCKET_ID</span>/objects/<span class="code-var">OBJECT_ID</span>"
);</code></pre>
          }

          <p class="response-label">Resposta — <code>200 OK</code></p>
          <pre class="code-block"><code>&#123; "deleted": true &#125;</code></pre>
        </section>

        <!-- Códigos de erro -->
        <section id="erros" class="card card__body doc-section">
          <header>
            <h2>Códigos de erro</h2>
            <p>Todas as respostas de erro seguem o formato <code>&#123; "message": "...", "statusCode": N &#125;</code>.</p>
          </header>
          <div class="error-table">
            <div class="error-row error-head">
              <span>Código</span>
              <span>Significado</span>
            </div>
            <div class="error-row">
              <span><code>401</code></span>
              <span>Chave de API ausente ou inválida.</span>
            </div>
            <div class="error-row">
              <span><code>403</code></span>
              <span>Chave sem permissão para acessar este bucket.</span>
            </div>
            <div class="error-row">
              <span><code>404</code></span>
              <span>Bucket ou objeto não encontrado.</span>
            </div>
            <div class="error-row">
              <span><code>409</code></span>
              <span>Já existe um objeto com este <code>key</code> no bucket.</span>
            </div>
            <div class="error-row">
              <span><code>422</code></span>
              <span>Dados inválidos na requisição (campo obrigatório ausente, etc.).</span>
            </div>
            <div class="error-row">
              <span><code>502</code></span>
              <span>Erro de comunicação com o Google Drive. Verifique a conexão em <em>Conexões</em>.</span>
            </div>
          </div>
        </section>

      </div><!-- /docs-main -->

      <!-- TOC lateral direita -->
      <aside class="docs-toc">
        <p class="toc-title">Nesta página</p>
        <nav>
          @for (item of tocItems; track item.id) {
            <a [attr.href]="'#' + item.id" [class.active]="activeSection() === item.id" [attr.aria-current]="activeSection() === item.id ? 'true' : null" (click)="$event.preventDefault(); scrollTo(item.id)">{{ item.label }}</a>
          }
        </nav>
      </aside>

    </div><!-- /docs-layout -->
  `,
  styles: [`
    .docs-layout { align-items: start; display: grid; gap: var(--space-10); grid-template-columns: minmax(0, 1fr) 210px; }
    .docs-main { display: flex; flex-direction: column; gap: var(--space-5); min-width: 0; }
    .doc-section { display: grid; gap: var(--space-4); scroll-margin-top: calc(var(--topbar-h) + var(--space-4)); }
    .doc-section header { display: grid; gap: var(--space-2); }
    .doc-section h2 { font-size: var(--text-lg); }
    .doc-section p { color: var(--color-ink-2); max-width: 760px; }
    .doc-section code:not(.code-block code) { background: var(--color-soft); border-radius: 4px; padding: 1px 5px; }

    .docs-toc { position: sticky; top: calc(var(--topbar-h) + var(--space-4)); }
    .docs-toc nav { display: flex; flex-direction: column; gap: 1px; }
    .toc-title { color: var(--color-muted); font-size: var(--text-xs); font-weight: var(--weight-medium); margin: 0 0 var(--space-2); }
    .docs-toc a { border-left: 2px solid transparent; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; color: var(--color-muted); display: block; font-size: var(--text-sm); line-height: 1.4; padding: 5px var(--space-3); text-decoration: none; transition: color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out); }
    .docs-toc a:hover { background: var(--color-soft); color: var(--color-ink); }
    .docs-toc a.active { background: color-mix(in srgb, var(--color-accent) 8%, transparent); border-left-color: var(--color-accent); color: var(--color-accent-text); font-weight: var(--weight-medium); }

    .endpoint-line { align-items: center; display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .method { --_c: var(--color-info); background: color-mix(in srgb, var(--_c) 12%, transparent); border-radius: var(--radius-sm); color: var(--_c); font-family: var(--font-mono); font-size: var(--text-xs); font-weight: var(--weight-semibold); padding: 3px 8px; }
    .method.post { --_c: var(--color-success); }
    .method.delete { --_c: var(--color-danger); }
    .endpoint-path { background: var(--color-soft); border-radius: var(--radius-sm); color: var(--color-ink); font-size: var(--text-sm); padding: 3px 8px; overflow-wrap: anywhere; }

    .code-var { color: var(--color-code-var); font-style: normal; }
    .code-var-inline { color: var(--color-danger); }

    .lang-tabs { margin-bottom: calc(var(--space-1) * -1); }

    .quickstart-steps { counter-reset: none; display: grid; gap: var(--space-3); list-style: none; margin: 0; padding: 0; }
    .quickstart-steps li { background: var(--color-soft); border-left: 3px solid var(--color-accent); border-radius: 0 var(--radius-md) var(--radius-md) 0; display: grid; gap: var(--space-1); padding: var(--space-3) var(--space-4); }
    .quickstart-steps strong { color: var(--color-ink); }
    .quickstart-steps span { color: var(--color-ink-2); font-size: var(--text-sm); }

    .response-label { color: var(--color-muted); font-size: var(--text-sm); margin: 0; }

    .error-table { border: 1px solid var(--color-line); border-radius: var(--radius-md); overflow: hidden; }
    .error-row { display: grid; grid-template-columns: 72px minmax(0, 1fr); }
    .error-row span { border-top: 1px solid var(--color-line); color: var(--color-ink-2); font-size: var(--text-sm); padding: var(--space-3) var(--space-4); }
    .error-head span { background: var(--color-soft); border-top: 0; color: var(--color-muted); font-size: var(--text-xs); font-weight: var(--weight-medium); }

    @media (max-width: 1100px) {
      .docs-layout { grid-template-columns: minmax(0, 1fr); }
      .docs-toc { display: none; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocsPageComponent implements AfterViewInit, OnDestroy {
  protected readonly tabs: { id: Lang; label: string }[] = [
    { id: 'curl', label: 'curl' },
    { id: 'js', label: 'JavaScript' },
    { id: 'python', label: 'Python' },
    { id: 'csharp', label: 'C#' }
  ];

  protected readonly tocItems: TocItem[] = [
    { id: 'url-base', label: 'URL base' },
    { id: 'quickstart', label: 'Início Rápido' },
    { id: 'autenticacao', label: 'Autenticação' },
    { id: 'listar-buckets', label: 'Listar buckets' },
    { id: 'upload', label: 'Enviar arquivo' },
    { id: 'listar-arquivos', label: 'Listar arquivos' },
    { id: 'download', label: 'Baixar arquivo' },
    { id: 'delete', label: 'Excluir arquivo' },
    { id: 'erros', label: 'Códigos de erro' }
  ];

  private readonly activeLang = signal<Record<string, Lang>>({
    'list-buckets': 'curl',
    upload: 'curl',
    list: 'curl',
    download: 'curl',
    delete: 'curl'
  });

  protected readonly activeSection = signal<string>('url-base');

  private observer!: IntersectionObserver;

  ngAfterViewInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) this.activeSection.set(visible.target.id);
      },
      { rootMargin: '-10% 0px -75% 0px' }
    );
    document.querySelectorAll('section[id]').forEach((s) => this.observer.observe(s));
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  protected lang(section: string): Lang {
    return this.activeLang()[section] ?? 'curl';
  }

  protected setLang(section: string, id: Lang): void {
    this.activeLang.update((tabs) => ({ ...tabs, [section]: id }));
  }

  protected scrollTo(id: string): void {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    this.activeSection.set(id);
  }
}
