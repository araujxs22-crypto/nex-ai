// NEX Local LLM: browser-side inference with no inference API or API key.
// The runtime and model weights are downloaded on first use, then cached by the browser.
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
let runtimePromise = null;
let generatorPromise = null;
let generator = null;
let activeModelId = null;
let generationQueue = Promise.resolve();

export const LOCAL_MODEL = Object.freeze({
  id: 'onnx-community/SmolLM2-135M-Instruct-ONNX',
  label: 'SmolLM2 135M Instruct · Q4',
  runtime: 'Transformers.js 3.8.1 / ONNX Runtime Web',
  device: 'WASM CPU',
  dtype: 'q4',
  approximateDownload: 'aproximadamente 200 MB na primeira utilização',
  hardwareProfile: 'perfil econômico para PCs com pouca RAM',
  privacy: 'A inferência ocorre no navegador. O runtime e os pesos são baixados do CDN/Hugging Face na primeira utilização.'
});

export const LOCAL_MODEL_OPTIONS = Object.freeze([
  LOCAL_MODEL,
  Object.freeze({
    id: 'onnx-community/Qwen3-0.6B-ONNX',
    label: 'Qwen3 0.6B · Q4 WebGPU (experimental)',
    runtime: 'Transformers.js 3.8.1 / ONNX Runtime WebGPU',
    device: 'WebGPU',
    dtype: 'q4f16',
    approximateDownload: 'aproximadamente 600 MB; varia conforme os arquivos carregados',
    hardwareProfile: 'recomendado apenas para computadores com mais memória e WebGPU estável',
    privacy: 'A inferência ocorre no navegador. Os pesos são baixados do Hugging Face na primeira utilização.'
  })
]);

function notify(onProgress, status, message, extra = {}) {
  try { onProgress({status, message, ...extra}); } catch {}
}

async function loadRuntime(onProgress) {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      notify(onProgress, 'loading-runtime', 'Carregando o runtime de IA local…');
      const module = await import(TRANSFORMERS_URL);
      if (typeof module.pipeline !== 'function') {
        throw new Error('O runtime Transformers.js não disponibilizou pipeline de geração.');
      }
      return module;
    })().catch(error => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

export function getLocalLLMInfo() {
  return {
    ...LOCAL_MODEL,
    loaded: Boolean(generator),
    loading: Boolean(generatorPromise),
    activeModelId: activeModelId || LOCAL_MODEL.id
  };
}

export async function loadLocalLLM(onProgress = () => {}, options = {}) {
  const modelId = options.modelId || LOCAL_MODEL.id;
  const profile = LOCAL_MODEL_OPTIONS.find(item => item.id === modelId);
  if (!profile) throw new Error('Modelo local não reconhecido: ' + modelId);
  if (profile.device === 'WebGPU' && typeof navigator !== 'undefined' && !navigator.gpu) {
    throw new Error('Este navegador não disponibilizou WebGPU. Use o modelo econômico SmolLM2 135M.');
  }
  if (generator && activeModelId === modelId) return generator;
  if (generatorPromise && activeModelId === modelId) return generatorPromise;

  // Only one model is kept loaded at a time to reduce peak memory use.
  generator = null;
  activeModelId = modelId;
  generatorPromise = (async () => {
    const {pipeline, env} = await loadRuntime(onProgress);
    if (env) {
      env.allowLocalModels = false;
      env.useBrowserCache = true;
    }
    notify(onProgress, 'loading-model', 'Preparando ' + profile.label + '…');
    const instance = await pipeline('text-generation', profile.id, {
      dtype: profile.dtype,
      ...(profile.device === 'WebGPU' ? {device: 'webgpu'} : {}),
      progress_callback: event => {
        const progress = Number.isFinite(event?.progress) ? Math.round(event.progress) : undefined;
        const file = event?.file ? String(event.file).split('/').at(-1) : undefined;
        const message = event?.status === 'progress'
          ? 'Baixando ' + (file || 'arquivos do modelo') + (progress === undefined ? '…' : ': ' + progress + '%')
          : 'Baixando/preparando os arquivos do modelo local…';
        notify(onProgress, event?.status || 'downloading-model', message, {file, progress});
      }
    });
    generator = instance;
    notify(onProgress, 'ready', profile.label + ' pronto no navegador.');
    return generator;
  })().catch(error => {
    generatorPromise = null;
    generator = null;
    activeModelId = null;
    throw error;
  });
  return generatorPromise;
}

function memorySnippet(item) {
  if (typeof item === 'string') return item;
  const title = item?.metadata?.title || '';
  return [title, item?.text || item?.content || ''].filter(Boolean).join(': ');
}

function buildMessages({text, history = [], memories = []}) {
  const memoryText = memories.slice(0, 3).map(memorySnippet).filter(Boolean).join('\n').slice(0, 900);
  const system = [
    'Você é NEX, um assistente de IA local integrado a ferramentas de programação, navegador e criação 3D.',
    'Responda em português brasileiro, com clareza, sem exagerar capacidades e sem inventar resultados.',
    'Você pode explicar, planejar e ajudar a pensar. Não afirme que clicou, pesquisou, executou código, salvou arquivos ou renderizou vídeos se uma ferramenta não confirmou isso.',
    'Quando a tarefa exigir uma ferramenta, diga qual etapa precisa ser executada pelo NEX. Se não souber, admita a incerteza.',
    'Seja objetivo. Evite repetir a pergunta.'
  ];
  if (memoryText) system.push('Memórias relevantes recuperadas pelo NEX (podem estar incompletas):\n' + memoryText);

  const messages = [{role: 'system', content: system.join('\n\n')}];
  for (const item of history.slice(-4)) {
    if (item?.user) messages.push({role: 'user', content: String(item.user).slice(0, 500)});
    if (item?.nex) messages.push({role: 'assistant', content: String(item.nex).slice(0, 500)});
  }
  messages.push({role: 'user', content: String(text || '').slice(0, 1200)});
  return messages;
}

function extractAnswer(result) {
  const generated = Array.isArray(result) ? result[0]?.generated_text : result?.generated_text;
  if (typeof generated === 'string') return generated;
  if (Array.isArray(generated)) {
    const finalMessage = [...generated].reverse().find(message => message?.role === 'assistant' && typeof message.content === 'string');
    return finalMessage?.content || '';
  }
  return '';
}

export async function generateLocalReply(
  {text, history = [], memories = [], modelId = LOCAL_MODEL.id} = {},
  onProgress = () => {}
) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new TypeError('A mensagem para o LLM local não pode estar vazia.');
  }
  const run = async () => {
    const model = await loadLocalLLM(onProgress, {modelId});
    notify(onProgress, 'generating', 'O NEX está pensando localmente…');
    const messages = buildMessages({text, history, memories});
    const result = await model(messages, {
      max_new_tokens: 112,
      do_sample: false,
      repetition_penalty: 1.08
    });
    const answer = extractAnswer(result)
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<\|im_end\|>[\s\S]*$/,'')
      .trim();
    if (!answer) throw new Error('O modelo local retornou uma resposta vazia.');
    notify(onProgress, 'complete', 'Resposta gerada localmente.');
    return answer;
  };

  const result = generationQueue.then(run, run);
  generationQueue = result.then(() => undefined, () => undefined);
  return result;
}
