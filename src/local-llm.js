// NEX Local LLM — browser-only inference, no API key and no paid provider.
let generatorPromise = null;
let generator = null;

export const LOCAL_MODEL = {
  id: 'HuggingFaceTB/SmolLM2-135M-Instruct',
  quantization: 'q4',
  runtime: 'Transformers.js / ONNX Runtime Web (WASM)',
  approximateDownload: '200 MB',
  privacy: 'Prompts and generated text stay in this browser tab after model download.'
};

export async function loadLocalLLM(onProgress = () => {}) {
  if (generator) return generator;
  if (!generatorPromise) {
    generatorPromise = (async () => {
      onProgress({status: 'loading-library', message: 'Carregando runtime local…'});
      const {pipeline, env} = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
      // Browser cache keeps model files for subsequent visits when supported.
      env.allowLocalModels = false;
      onProgress({status: 'downloading-model', message: 'Baixando o modelo local (aprox. 200 MB na primeira vez)…'});
      const instance = await pipeline('text-generation', LOCAL_MODEL.id, {
        dtype: LOCAL_MODEL.quantization
      }, {
        progress_callback: (event) => onProgress({
          status: event.status || 'downloading-model',
          file: event.file,
          progress: event.progress,
          message: event.status === 'progress'
            ? 'Baixando ' + (event.file || 'modelo') + ': ' + Math.round(event.progress || 0) + '%'
            : 'Preparando modelo local…'
        })
      });
      generator = instance;
      onProgress({status: 'ready', message: 'Modelo local pronto.'});
      return generator;
    })().catch(error => {
      generatorPromise = null;
      generator = null;
      throw error;
    });
  }
  return generatorPromise;
}

export async function generateLocalReply(text, memories = [], onProgress = () => {}) {
  const model = await loadLocalLLM(onProgress);
  const memoryText = memories
    .slice(0, 3)
    .map(item => typeof item === 'string' ? item : (item.content || item.text || ''))
    .filter(Boolean)
    .join('\n')
    .slice(0, 1200);
  const prompt = [
    '<|im_start|>system',
    'Você é NEX, um assistente de programação e criação de cenas 3D. Responda em português brasileiro, com clareza e sem inventar capacidades. Seja conciso. O Code Engine e o Video Engine são ferramentas separadas; não diga que executou código ou renderizou vídeo se isso não aconteceu.',
    memoryText ? 'Memórias relevantes do usuário:\n' + memoryText : '',
    '<|im_end|>',
    '<|im_start|>user',
    text.slice(0, 1800),
    '<|im_end|>',
    '<|im_start|>assistant'
  ].filter(Boolean).join('\n');
  const result = await model(prompt, {
    max_new_tokens: 120,
    do_sample: false,
    return_full_text: false
  });
  const output = Array.isArray(result) ? result[0]?.generated_text : result?.generated_text;
  const answer = typeof output === 'string' ? output.trim() : '';
  return answer.replace(/<\|im_end\|>[\s\S]*$/,'').trim()
    || 'O modelo local não conseguiu gerar uma resposta desta vez. Tente reformular.';
}
