import {NexMemory} from './memory/memory.js';
import {NexVideoEngine} from './engines/video-engine.js';
import {NexCodeEngine} from './engines/code-engine.js';
import {NexChatEngine} from './chat-engine.js';

export class NexCore {
  constructor(options = {}) {
    this.memory = new NexMemory(options.memory);
    this.video = new NexVideoEngine();
    this.code = new NexCodeEngine();
    this.chat = new NexChatEngine({
      memory: this.memory,
      video: this.video,
      code: this.code
    });
  }

  train(options = {}) {
    return this.chat.train(options);
  }

  ask(text) {
    return this.chat.handle(text);
  }

  evaluate() {
    return this.chat.evaluate();
  }

  calibrate(options = {}) {
    return this.chat.calibrateRouter(options);
  }

  saveModel(storageKey = 'nex-core-model') {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(storageKey, this.chat.exportModel());
    return true;
  }

  loadModel(storageKey = 'nex-core-model') {
    if (typeof localStorage === 'undefined') return false;

    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;

    let saved;
    try {
      saved = JSON.parse(raw);
    } catch {
      throw new Error('Arquivo do modelo inválido: JSON corrompido');
    }

    // restoreModel valida tudo antes de trocar o estado atual do NEX.
    this.chat.restoreModel(saved);
    return true;
  }

  get status() {
    return {
      name: 'NEX Core',
      version: '0.2.3',
      offline: true,
      trainableNetwork: true,
      intentRejection: true,
      validationSplit: true,
      videoPlanningPreserved: true,
      codeAnalysisPreserved: true,
      generalKnowledge: 'limited/local'
    };
  }
}

export {TinyMLP, TextVectorizer} from './neural/tiny-mlp.js';
export {NexMemory} from './memory/memory.js';
export {NexVideoEngine} from './engines/video-engine.js';
export {NexCodeEngine} from './engines/code-engine.js';
