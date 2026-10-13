# Colocando o Auction Analysis no ar, com IA

Caminho: **seu computador → GitHub → Cloudflare Workers**. Depois do primeiro deploy, cada `git push` republica o site sozinho. A IA (Gemini) liga com uma chave guardada como segredo na Cloudflare.

Você precisa de uma conta no GitHub, uma conta na Cloudflare (o plano gratuito basta) e, de preferência, um computador.

## Parte 1: GitHub

### Se você já subiu a versão antiga (lot-ledger)

Este é o seu caso. Você vai trocar os arquivos do mesmo repositório. Não precisa criar outro.

Descompacte o zip `auction-analysis.zip` em uma pasta nova. Depois, no terminal, entre na pasta do seu repositório antigo (a que já está ligada ao GitHub) e apague os arquivos antigos mantendo a pasta `.git`. No Mac ou Linux:

```bash
cd caminho/da/pasta-do-repositorio-antigo
git rm -r --quiet src worker public
```

Copie para dentro dela todo o conteúdo da pasta nova (incluindo os arquivos escondidos `.gitignore`, `.nvmrc` e `.env.demo`), sobrescrevendo o que já existe. Depois:

```bash
git add -A
git commit -m "Auction Analysis v2 com IA"
git push
```

Se você preferir a interface do GitHub no navegador, apague as pastas `src`, `worker` e `public` do repositório (abra cada arquivo, clique nos três pontinhos e escolha Delete, ou use o aplicativo GitHub Desktop, que é bem mais rápido para isso) e depois use **Add file → Upload files** arrastando o conteúdo da pasta nova. Por isso o terminal ou o GitHub Desktop é o caminho recomendado.

Se quiser, renomeie o repositório para `auction-analysis` em **Settings → General → Repository name**. O GitHub redireciona o nome antigo, e a Cloudflare continua funcionando.

### Se estiver começando do zero

1. No GitHub, clique no **+** e depois em **New repository**. Em *Repository name* escreva `auction-analysis`. Escolha Private ou Public. **Não marque** README, .gitignore nem license.
2. Descompacte o zip. No terminal, dentro da pasta descompactada:

```bash
git init -b main
git add .
git commit -m "Auction Analysis v2"
git remote add origin https://github.com/SEU_USUARIO/auction-analysis.git
git push -u origin main
```

Confira no GitHub: `package.json` e `wrangler.jsonc` precisam aparecer na primeira tela, junto de `src`, `worker` e `public`.

## Parte 2: Cloudflare

### O nome do projeto precisa bater

No arquivo `wrangler.jsonc`, o campo `name` agora é `auction-analysis`. O nome do Worker no painel da Cloudflare precisa ser **exatamente igual**, senão o build falha.

Você já criou um Worker chamado `lot-ledger` na etapa anterior. Tem duas saídas, escolha uma:

- **Mais simples:** abra `wrangler.jsonc`, troque `"name": "auction-analysis"` para `"name": "lot-ledger"` e faça o commit e o push. O site fica com o endereço antigo (`lot-ledger...workers.dev`), mas o app já se chama Auction Analysis na tela.
- **Mais limpo:** crie um Worker novo. Em **Workers & Pages → Create → Import a repository**, escolha o repositório, em *Project name* escreva `auction-analysis`, *Build command* `npm run build`, e deixe o *Deploy command* como `npx wrangler deploy`. Depois você pode apagar o Worker antigo.

Se estiver começando do zero, use a segunda opção.

### Acompanhe o build

A Cloudflare instala as dependências, roda `npm run build` e `npx wrangler deploy`. Leva de 1 a 3 minutos. O endereço final aparece na página do projeto.

### Teste

Abra o link. Você deve ver a tela inicial com os 3 catálogos de demonstração. Acrescente `/api/health` ao endereço. Antes da chave, deve aparecer `{"ok":true,"ai":false,...}`.

## Parte 3: Ligar a IA

### 1. Pegue a chave do Gemini

Entre em **aistudio.google.com/apikey** com sua conta Google e clique em **Create API key**. Copie a chave. Ela tem uma cota gratuita. No plano gratuito, o Google pode usar o conteúdo enviado para melhorar seus produtos; os títulos de lotes de leilão não são sensíveis, mas não envie nada confidencial.

### 2. Guarde a chave na Cloudflare

No painel, abra o seu Worker, vá em **Settings → Variables and Secrets** e clique em **Add**. Em *Type* escolha **Secret**, em *Variable name* escreva `GEMINI_API_KEY`, cole a chave em *Value* e salve. A Cloudflare republica o Worker sozinha.

Pelo terminal, o equivalente é `npx wrangler secret put GEMINI_API_KEY`.

A chave nunca vai para o GitHub e nunca chega ao navegador: só o Worker a enxerga.

### 3. Teste

Abra `/api/health` de novo: agora deve mostrar `"ai":true`. Na tela do app, clique em **Scan New Auction**, cole o link de um catálogo e clique em **Scan and analyze**. O app lê as páginas, depois pesquisa o preço de mercado em grupos de 6 lotes, mostrando o progresso. Catálogos grandes levam alguns minutos.

### Opções

Para trocar o modelo, em **Variables and Secrets** adicione uma variável de texto `GEMINI_MODEL` com o nome do modelo (por padrão o app usa `gemini-3.5-flash`). Se aparecer a mensagem "model not found", esse é o ajuste.

Se você assinar o plano pago da Cloudflare, pode adicionar `CRAWL_PAGES_PER_CALL` com um número de 1 a 5 para ler mais páginas por requisição. No plano gratuito deixe sem definir.

Nunca defina `ALLOW_PRIVATE_HOSTS` em produção: ela existe só para testes locais e desliga a proteção contra acesso a endereços internos.

## Atualizando depois

Mexeu em qualquer arquivo? `git add -A && git commit -m "o que mudou" && git push`. A Cloudflare republica sozinha.

Para rodar na sua máquina: `npm install`, depois `npm run dev:demo` (só demonstração) ou `npm run cf:dev` (site e API juntos; para a IA, crie um arquivo `.dev.vars` com a linha `GEMINI_API_KEY=sua_chave`).

## Instalar no celular

Abra o link no celular. No Chrome do Android use **Instalar app**. No iPhone, abra no Safari, toque em **Compartilhar** e depois em **Adicionar à Tela de Início**.

## Se der erro

**O build falha dizendo que o nome não bate.** O nome do Worker no painel é diferente do `name` em `wrangler.jsonc`. Deixe os dois iguais.

**O build falha com erro de versão do Node.** Em **Settings → Build → Variables** adicione `NODE_VERSION` com valor `22`.

**O build falha com "package.json not found".** Os arquivos foram enviados dentro de uma subpasta. Refaça o envio com o `package.json` na raiz.

**Scan mostra "The AI is not set up yet".** A chave `GEMINI_API_KEY` não foi salva como Secret, ou o Worker ainda não republicou. Confira `/api/health`.

**Scan mostra "The Gemini API key is not valid".** A chave foi colada errada ou apagada. Crie outra no AI Studio e salve de novo.

**Scan mostra "Gemini rate limit reached".** A cota gratuita acabou por agora. Espere um minuto e tente de novo, ou analise menos lotes.

**"No lots were found on that page".** O site monta os lotes com JavaScript no navegador, ou usa um formato que o leitor não reconhece. Use a aba PDF / photo ou Paste text. Para um site específico, dá para ajustar `CONTAINER_SELECTOR` em `worker/auctionCrawler.ts`.

**Aparece "Worker exceeded CPU time limit".** O plano gratuito permite 10 ms de CPU por requisição. O app lê uma página por vez para ficar dentro disso, mas uma página enorme pode estourar. Tente outra página do catálogo ou assine o plano pago.

**Mudei o código e o site continua igual.** O app guarda uma cópia para funcionar sem internet. Feche e abra de novo, ou recarregue sem cache (`Ctrl + Shift + R`).
