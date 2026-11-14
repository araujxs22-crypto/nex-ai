# NEX AI · Core 0.5.0 · Browser Agent 1.4.0

Aplicação web com núcleo modular em JavaScript, motores de código e planejamento 3D, memória local e uma extensão Chrome Manifest V3 para ações explícitas em uma aba autorizada. O Core funciona localmente; recursos de pesquisa na interface dependem de conexão com a internet.

## O que foi implementado

- **Rede neural própria:** MLP pequena em JavaScript puro, com camada oculta `tanh`, saída `softmax`, entropia cruzada, backpropagation, atualização de pesos, métricas e serialização.
- **NEX Video Engine:** transforma uma descrição em um plano JSON de cena, objetos, câmera, iluminação e timeline. É um planejador, não um renderizador ou gerador de vídeo.
- **NEX Code Engine 0.4.0:** análise estrutural leve para JavaScript, Python e HTML; diagnósticos com severidade, linha, coluna e sugestão; detecção de delimitadores/string sem fechamento, atribuições incompletas, cabeçalhos Python sem dois-pontos, tags HTML incompatíveis e ids duplicados; scaffolds JavaScript/Python com arquivos de teste e comandos sugeridos; os projetos gerados são executados em diretórios temporários no CI para validar os testes incluídos.
- **NEX Chat:** classifica intenções e coordena vídeo, código e memória. Conversação geral é deliberadamente limitada e local.
- **Memória:** armazenamento persistente em `localStorage` no navegador, com busca lexical e exportação/importação JSON. Memória não altera os pesos da rede.


## Melhorias do Core 0.4.0

- Checkpoints da rede neural são cópias independentes; os parâmetros e exemplos de treinamento são validados antes do treino.
- Vetorização de texto usa índice por token para evitar busca linear em todo o vocabulário.
- Memória local valida importação, limita tamanho e quantidade, melhora busca por título/tags e não confirma gravações que falharam.
- Code Engine gera também um scaffold de site responsivo (HTML/CSS/JS) com testes executáveis, além dos scaffolds JavaScript e Python.
- Video Engine produz planos v2 com múltiplos objetos, posições, câmera, ambiente, iluminação, animação e timeline. O plano não equivale a renderização nem geração de vídeo.
- Métricas de rejeição separam rejeição por limiar de uma previsão da classe "unknown".

## Limitações honestas

Com Intel i3-8100, 4 GB de RAM, Intel UHD 630 e sem instalar programas, é viável treinar modelos pequenos e executar regras/planejamento no Chrome. Não é viável, neste pacote, treinar do zero um modelo generativo de vídeo 3D, um LLM competitivo ou um renderizador 3D completo. Isso exigiria grandes conjuntos de dados, GPU dedicada, armazenamento e um pipeline de renderização/treino substancial.

O módulo está preparado para evolução: os motores retornam contratos JSON estáveis e a MLP pode ser substituída futuramente por um modelo maior/WebGPU ou por um backend local, sem mudar a interface de integração.

## Testes

No ambiente de desenvolvimento, execute:

```bash
node tests/run-tests.mjs
```

O teste comprova: pesos mudando, perda diminuindo, acurácia, persistência/restauração, memória, interpretação de comandos, plano 3D/vídeo e análise de programação. No Chrome, abra `demo/index.html` através de um servidor local simples ou de um ambiente que permita módulos ES; não é necessário instalar dependências do projeto.

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

`index.html` é a entrada do site e preserva a interface existente. Importa `src/index.js`, inicializa o NEX Core 0.5.0, treina e calibra o modelo na primeira abertura e persiste os pesos em `localStorage`. Pedidos de programação usam o Code Engine; pedidos de cena usam o Video Engine. O Core não executa código arbitrário nem grava arquivos diretamente no computador. Para publicar com GitHub Pages, configure a publicação pela raiz da branch que contém `index.html`.
