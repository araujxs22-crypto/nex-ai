# NEX AI · Core 0.6.0 · Browser Agent 1.4.0

Aplicação web com núcleo modular em JavaScript, motores de código e planejamento 3D, memória local e uma extensão Chrome Manifest V3 para ações explícitas em uma aba autorizada. O Core funciona localmente; recursos de pesquisa na interface dependem de conexão com a internet.

## O que foi implementado

- **Rede neural própria:** TinyMLP em JavaScript puro para classificar intenções. Usa TF-IDF com unigramas e bigramas, normalização L2, regularização L2, clipping de gradientes, validação, early stopping e persistência versionada. Ela é um roteador de ferramentas, não um modelo generativo.
- **NEX Video Engine:** transforma uma descrição em um plano JSON de cena, objetos, câmera, iluminação e timeline. É um planejador, não um renderizador ou gerador de vídeo.
- **NEX Code Engine 0.4.0:** análise estrutural leve para JavaScript, Python e HTML; diagnósticos com severidade, linha, coluna e sugestão; detecção de delimitadores/string sem fechamento, atribuições incompletas, cabeçalhos Python sem dois-pontos, tags HTML incompatíveis e ids duplicados; scaffolds JavaScript/Python com arquivos de teste e comandos sugeridos; os projetos gerados são executados em diretórios temporários no CI para validar os testes incluídos.
- **NEX Chat + LLM local:** a TinyMLP encaminha intenções; mensagens gerais/ambíguas podem usar o SmolLM2-135M-Instruct quantizado em Q4, executado no navegador via Transformers.js/ONNX Runtime Web. A inferência é local e não usa API paga. O download inicial do runtime e dos pesos exige internet e fica no cache do navegador.
- **Memória:** armazenamento persistente em `localStorage` no navegador, com busca lexical e exportação/importação JSON. Memória não altera os pesos da rede.


## Melhorias do Core 0.4.0

- Checkpoints da rede neural são cópias independentes; os parâmetros e exemplos de treinamento são validados antes do treino.
- Vetorização de texto usa índice por token para evitar busca linear em todo o vocabulário.
- Memória local valida importação, limita tamanho e quantidade, melhora busca por título/tags e não confirma gravações que falharam.
- Code Engine gera também um scaffold de site responsivo (HTML/CSS/JS) com testes executáveis, além dos scaffolds JavaScript e Python.
- Video Engine produz planos v2 com múltiplos objetos, posições, câmera, ambiente, iluminação, animação e timeline. O plano não equivale a renderização nem geração de vídeo.
- Métricas de rejeição separam rejeição por limiar de uma previsão da classe "unknown".

## LLM local e arquitetura híbrida · Core 0.6.0

O NEX agora separa duas responsabilidades:

1. **TinyMLP:** classifica a intenção e encaminha pedidos claros para os motores de código, vídeo, memória ou navegador.
2. **LLM local:** gera respostas para conversa geral e intenções que o classificador não consegue resolver com confiança.

Perfil inicial: `onnx-community/SmolLM2-135M-Instruct-ONNX`, Q4, CPU/WASM. O carregamento é sob demanda; a primeira utilização baixa aproximadamente 200 MB. Depois, o browser pode reutilizar o cache. A qualidade é limitada por ser um modelo de 135 milhões de parâmetros e pode ser lenta no computador com 4 GB de RAM.

O código também registra um perfil experimental para `onnx-community/Qwen3-0.6B-ONNX` em WebGPU, mas não é o padrão para máquinas com pouca memória. O LLM não foi treinado pelo projeto: são pesos pré-treinados de terceiros. O diferencial do NEX está em coordenar esse modelo com os motores, a memória e a extensão.

**Privacidade e limites:** as mensagens usadas na inferência são processadas no navegador; runtime e pesos vêm de CDN/Hugging Face no primeiro uso. A inferência não chama um endpoint de geração pago. O LLM ainda não tem um planejador autônomo completo nem executa ferramentas por conta própria; as ferramentas continuam sob o controle do roteador e do agente.

## Melhorias da TinyMLP

- Vetorização com unigramas + bigramas, para preservar parte da ordem das palavras.
- Pesos IDF calculados somente no conjunto de treino e normalização L2.
- Clipping global de gradientes para conter atualizações instáveis.
- Weight decay para reduzir sobreajuste.
- Mini-lotes e early stopping pela validação.
- O snapshot do classificador salva também a versão do vetorizador e os pesos IDF; snapshots antigos são descartados e a rede é treinada novamente com o formato novo.

## Limitações honestas

Com Intel i3-8100, 4 GB de RAM, Intel UHD 630 e sem instalar programas, é viável treinar modelos pequenos e executar regras/planejamento no Chrome. Não é viável, neste pacote, treinar do zero um modelo generativo de vídeo 3D, um LLM competitivo ou um renderizador 3D completo. Isso exigiria grandes conjuntos de dados, GPU dedicada, armazenamento e um pipeline de renderização/treino substancial.

O módulo está preparado para evolução: os motores retornam contratos JSON estáveis e a MLP pode ser substituída futuramente por um modelo maior/WebGPU ou por um backend local, sem mudar a interface de integração.

## Testes

No ambiente de desenvolvimento, execute:

```bash
node tests/run-tests.mjs
```

O teste comprova: pesos mudando, vetorização TF-IDF com bigramas, clipping/regularização, calibração, persistência/restauração, memória, integração do adaptador LLM, interpretação de comandos, plano 3D/vídeo e análise de programação. No Chrome, abra `demo/index.html` através de um servidor local simples ou de um ambiente que permita módulos ES; não é necessário instalar dependências do projeto.

## Agente de navegador · extensão Chrome 1.4.0

A extensão em `extension/sala-do-futuro/` conecta o site NEX a uma única aba HTTPS autorizada pelo usuário. O agente aceita comandos explícitos de leitura, hover textual, clique seguro, preenchimento de campos, seleção de radio/checkbox, voltar, avançar e recarregar.

- `src/browser/command-parser.js` interpreta comandos curtos e explícitos. Pedidos compostos ainda não são um plano autônomo.
- `extension/sala-do-futuro/background.js` valida pareamento, aba autorizada, pausa e roteia comandos.
- `extension/sala-do-futuro/page-actions.js` lê texto e controles visíveis, localiza elementos, preenche campos e seleciona opções com verificação.
- Depois de `READ_PAGE`, `index.html` guarda o conteúdo lido e o envia ao parser de atividades escolares para manter o contexto em perguntas seguintes.

**Limitações atuais:** o NEX ainda não inclui um LLM generativo próprio. O classificador MLP identifica intenções, mas não raciocina como Claude/GPT. O agente não transforma instruções longas em planos independentes de várias etapas; a pesquisa disponível na interface é limitada; e eventos sintéticos de mouse não garantem CSS `:hover` físico. Ações de envio/finalização não devem ser acionadas automaticamente.

Exemplos de comandos explícitos no chat:
- `ler página`
- `passar mouse sobre Tarefa 5`
- `clicar em Pesquisar`
- `preencher campo Nome com Kaue`
- `marcar Certo na questão 2`

## Integração no HTML existente

Copie a pasta `nex-core` para o mesmo diretório do aplicativo. No seu JavaScript atual:

```js
import { NexCore } from './nex-core/src/index.js';
const nex = new NexCore();

const metricas = nex.train({
  epochs: 180,
  onEpoch: (m) => console.log(m.epoch, m.loss, m.accuracy)
});

const resposta = nex.ask('crie uma cena 3d com uma nave e camera pan');
console.log(resposta.result); // plano estruturado JSON
```

Para conectar ao campo de conversa existente, passe o texto do usuário para `nex.ask(texto)` e renderize o objeto retornado na sua própria interface. Exemplos de tipos retornados: `video-plan`, `code`, `memory`, `memory-search` e `chat`.

A memória usa `localStorage`. Para limpar ou exportar:

```js
nex.memory.clear();
const backup = nex.memory.export();
```

Para persistir pesos em uma versão posterior, o objeto serializável está disponível em `nex.chat.model.toJSON()`. A restauração direta usa `TinyMLP.fromJSON(...)` e deve ser combinada com o mesmo vocabulário de treino.

## Estrutura

```text
src/neural/tiny-mlp.js       rede neural e vetorizador
src/engines/video-engine.js  planejamento 3D/vídeo
src/engines/code-engine.js   análise estrutural, diagnósticos e scaffold de programação
src/memory/memory.js         memória local
src/chat-engine.js           classificação e coordenação
src/nex-core.js              fachada pública
data/training-data.js        exemplos iniciais
tests/run-tests.mjs          testes obrigatórios
demo/index.html              demonstração offline
```

## Próximas etapas realistas

1. Adicionar dados de treino próprios, separados em treino/validação/teste, e versioná-los.
2. Trocar o classificador de intenção por um modelo de embeddings local pequeno quando houver um runtime offline apropriado.
3. Integrar Three.js apenas como renderizador separado do planejador, caso a interface já possa carregar um arquivo local.
4. Evoluir a análise estrutural leve para parsers AST completos por linguagem, mantendo diagnósticos com localização e testes de regressão.
5. Em hardware melhor, criar um serviço local opcional para modelos maiores e treinamento controlado. O contrato JSON dos engines pode permanecer igual.


## Aplicação integrada

`index.html` é a entrada do site e preserva a interface existente. Importa `src/index.js`, inicializa o NEX Core 0.6.0, treina e calibra o modelo na primeira abertura e persiste os pesos em `localStorage`. Pedidos de programação usam o Code Engine; pedidos de cena usam o Video Engine. O Core não executa código arbitrário nem grava arquivos diretamente no computador. Para publicar com GitHub Pages, configure a publicação pela raiz da branch que contém `index.html`.


## Agentes especializados · Browser Agent 1.5.0

O NEX é direcionado a duas áreas: programação e controle explícito do navegador. O popup 1.5.0 foi reorganizado em painéis de conexão, navegação, interação e conteúdo lido. O chat mostra uma faixa compacta de atividade durante pesquisa, leitura de página, chamadas ao LLM e operações de código.

### Agente de programação local

O serviço opcional `local-agent/server.mjs` permite listar, ler, criar e editar arquivos e executar verificações no Windows. Para iniciar:

1. Tenha Node.js instalado.
2. Execute `start-nex-agent.bat`.
3. Copie o token de uso único exibido no terminal.
4. Abra a seção Agente de Navegador no NEX, conecte a extensão atualizada e cole o token em Agente de programação local.

O serviço escuta apenas em `127.0.0.1`, exige token Bearer, não oferece terminal arbitrário e restringe caminhos ao workspace `Documentos/NEX-Workspace`. Comandos permitidos: `npm test`, `npm run <script>`, `node <arquivo.js>` e `python <arquivo.py>`. A criação de scaffolds evita sobrescrever arquivos existentes. Arquivos são limitados a 1 MB por arquivo; listagem ignora dependências e diretórios de build.

### Comandos suportados pelo agente

- `listar arquivos`
- `listar arquivos em src`
- `ler arquivo src/app.js`
- `criar arquivo notas.txt com conteúdo: ...`
- `editar arquivo src/app.js com conteúdo: ...`
- `executar npm test`
- `ler página; clicar em Pesquisar`

Planos de navegador aceitam até oito ações explícitas separadas por ponto e vírgula, quebra de linha ou “e depois”. Cada etapa é executada em sequência e o NEX interrompe o plano se uma ação falhar. Isso ainda não equivale a planejamento livre para qualquer linguagem natural: o parser aceita comandos conhecidos e não envia formulários automaticamente.

**Limites técnicos:** o agente local é uma ferramenta de programação com escopo restrito, não um LLM mais inteligente. O SmolLM2 135M continua limitado; o roteamento e as operações especializadas não dependem dele para executar comandos estruturados. A execução de scripts dentro do workspace pode alterar dados do projeto, portanto execute apenas projetos em que confia.


### Atualizar a extensão existente sem baixar ZIP manualmente

No PowerShell do Windows, execute:

```powershell
irm https://raw.githubusercontent.com/araujxs22-crypto/nex-ai/feat/nex-browser-agent/tools/update-nex-extension.ps1 | iex
```

Selecione a pasta que já está carregada no Chrome. O script baixa o código temporariamente, valida o manifesto NEX 1.5.0, copia os arquivos da extensão para a pasta escolhida e apaga o temporário. Depois, clique em **Atualizar** em `chrome://extensions`. O script não altera o restante do projeto.
