# NEX Core 0.1.0

Módulo independente, offline e sem APIs pagas para ser integrado a uma aplicação HTML/JavaScript existente. Ele não altera nem recria a interface do NEX AI.

## O que foi implementado

- **Rede neural própria:** MLP pequena em JavaScript puro, com camada oculta `tanh`, saída `softmax`, entropia cruzada, backpropagation, atualização de pesos, métricas e serialização.
- **NEX Video Engine:** transforma uma descrição em um plano JSON de cena, objetos, câmera, iluminação e timeline. É um planejador, não um renderizador ou gerador de vídeo.
- **NEX Code Engine:** detecção simples de linguagem, análise estática heurística e scaffold de arquivos. Não substitui compilador, testes ou um modelo de programação avançado.
- **NEX Chat:** classifica intenções e coordena vídeo, código e memória. Conversação geral é deliberadamente limitada e local.
- **Memória:** armazenamento persistente em `localStorage` no navegador, com busca lexical e exportação/importação JSON. Memória não altera os pesos da rede.

## Limitações honestas

Com Intel i3-8100, 4 GB de RAM, Intel UHD 630 e sem instalar programas, é viável treinar modelos pequenos e executar regras/planejamento no Chrome. Não é viável, neste pacote, treinar do zero um modelo generativo de vídeo 3D, um LLM competitivo ou um renderizador 3D completo. Isso exigiria grandes conjuntos de dados, GPU dedicada, armazenamento e um pipeline de renderização/treino substancial.

O módulo está preparado para evolução: os motores retornam contratos JSON estáveis e a MLP pode ser substituída futuramente por um modelo maior/WebGPU ou por um backend local, sem mudar a interface de integração.

## Testes

No ambiente de desenvolvimento, execute:

```bash
node tests/run-tests.mjs
```

O teste comprova: pesos mudando, perda diminuindo, acurácia, persistência/restauração, memória, interpretação de comandos, plano 3D/vídeo e análise de programação. No Chrome, abra `demo/index.html` através de um servidor local simples ou de um ambiente que permita módulos ES; não é necessário instalar dependências do projeto.

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
src/engines/code-engine.js   análise e scaffold de programação
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
4. Adicionar parser/AST real para cada linguagem suportada.
5. Em hardware melhor, criar um serviço local opcional para modelos maiores e treinamento controlado. O contrato JSON dos engines pode permanecer igual.
