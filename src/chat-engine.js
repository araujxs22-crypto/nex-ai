import {TinyMLP, TextVectorizer} from './neural/tiny-mlp.js';
import {IntentRouter} from './intent-router.js';
import {respondToSocialMessage} from './dialogue.js';
import {calibrateRejectionThresholds} from './evaluation/calibration.js';
import {NexSchoolTaskEngine} from './engines/school-task-engine.js';
import {
  TRAIN_EXAMPLES,
  VALIDATION_EXAMPLES,
  TEST_EXAMPLES,
  UNKNOWN_EXAMPLES,
  UNKNOWN_CALIBRATION_EXAMPLES,
  DATASET_VERSION
} from '../data/training-data.js';

function isUniqueStringArray(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every(item => typeof item === 'string' && item.trim().length > 0)
    && new Set(value).size === value.length;
}

function isThreshold(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export class NexChatEngine {
  constructor({memory, video, code, model = null} = {}) {
    this.memory = memory;
    this.video = video;
    this.code = code;
    this.school = new NexSchoolTaskEngine();
    this.activeSchoolTask = null;

    const {vectorizer, labels} = TextVectorizer.fromExamples(TRAIN_EXAMPLES);
    this.vectorizer = vectorizer;
    this.labels = labels;
    this.model = model || new TinyMLP({
      inputSize: vectorizer.vocab.length,
      hiddenSize: 16,
      outputSize: labels.length,
      learningRate: 0.12,
      weightDecay: 0.0005,
      gradientClipNorm: 1,
      seed: 7
    });
    this.router = new IntentRouter({model: this.model, vectorizer, labels});
    this.training = this.encodeExamples(TRAIN_EXAMPLES, vectorizer, labels);
    this.validation = this.encodeExamples(VALIDATION_EXAMPLES, vectorizer, labels);
    this.testExamples = TEST_EXAMPLES;
    this.datasetVersion = DATASET_VERSION;
  }

  encodeExamples(examples, vectorizer = this.vectorizer, labels = this.labels) {
    return examples.map(example => {
      const labelIndex = labels.indexOf(example.label);
      if (labelIndex < 0) {
        throw new Error(`Rótulo ausente no modelo: ${example.label}`);
      }
      return {x: vectorizer.encode(example.text), y: labelIndex};
    });
  }

  train(options = {}) {
    return this.model.train(this.training, {
      epochs: options.epochs ?? 300,
      validation: this.validation,
      batchSize: options.batchSize ?? 12,
      patience: options.patience ?? 40,
      weightDecay: options.weightDecay ?? 0.0005,
      gradientClipNorm: options.gradientClipNorm ?? 1,
      onEpoch: options.onEpoch
    });
  }

  classify(text) {
    return this.router.classify(text);
  }

  calibrateRouter(options = {}) {
    const knownExamples = VALIDATION_EXAMPLES.filter(example => example.label !== 'unknown');
    const result = calibrateRejectionThresholds({
      knownExamples,
      outOfDomainExamples: UNKNOWN_CALIBRATION_EXAMPLES,
      minKnownCoverage: options.minKnownCoverage ?? 0.75,
      classifyRaw: text => {
        const prediction = this.model.predict(this.vectorizer.encode(text));
        return {
          rawIntent: this.labels[prediction.index],
          confidence: prediction.confidence,
          margin: prediction.margin,
          recognizedRatio: this.vectorizer.recognizedRatio(text)
        };
      }
    });

    this.router.confidenceThreshold = result.thresholds.confidenceThreshold;
    this.router.marginThreshold = result.thresholds.marginThreshold;
    this.router.recognizedThreshold = result.thresholds.recognizedThreshold;
    return result;
  }

  evaluate() {
    const predictions = this.testExamples.map(example => {
      const classification = this.classify(example.text);
      return {
        ...classification,
        actual: example.label,
        predicted: classification.intent
      };
    });

    const unknown = UNKNOWN_EXAMPLES.map(text => {
      const classification = this.classify(text);
      return {...classification, text, predicted: classification.intent};
    });

    return {datasetVersion: this.datasetVersion, predictions, unknown};
  }

  handle(text) {
    const socialReply = respondToSocialMessage(text);
    if (socialReply) return socialReply;

    // Reconhece texto copiado da Sala do Futuro antes do classificador de intenções.
    const schoolTask = this.school.parse(text);
    if (schoolTask) {
      this.activeSchoolTask = schoolTask;
      return {type: 'school-task', result: schoolTask, text: this.school.describe(schoolTask)};
    }

    // Normalize a entrada antes de qualquer regra: acentos, pontuação e espaços.
    const normalized = String(text ?? '').toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_\s]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

    // Mantém o contexto da atividade para pedidos como “me ajuda na questão 2”.
    const questionRequest = normalized.match(/\bquestao\s*(\d+)\b/);
    if (this.activeSchoolTask && questionRequest) {
      return this.school.guideQuestion(this.activeSchoolTask, Number(questionRequest[1]));
    }

    // Mensagens curtas sobre programação são pedidos de conversa, não texto desconhecido.
    if (/^(programacao|programar|programando|codigo|codar|ptogamacao)$/.test(normalized)) {
      return {
        type: 'chat',
        text: 'Claro! Posso ajudar com programação, analisar código, encontrar erros ou montar um projeto. O que você quer programar?'
      };
    }

    // Intenções explícitas evitam que "criar um aplicativo" seja confundido com vídeo.
    const codingIntent = /\b(programacao|programar|programando|codigo|codar|python|javascript|typescript|html|css|script|bug|depurar|depuracao|app|aplicativo|aplicativos|programa|software|api|site)\b/.test(normalized)
      || /\b(ptogama)\w*\b/.test(normalized);
    const videoIntent = /\b(video|videos|cena|cenas|3d|animacao|animacoes|animar|storyboard|camera|render|renderizar|filmagem|curta|personagem|iluminacao)\b/.test(normalized);

    const classification = codingIntent
      ? {intent: 'code', rawIntent: 'code', accepted: true, confidence: 1, margin: 1, recognizedRatio: 1}
      : videoIntent
        ? {intent: 'video', rawIntent: 'video', accepted: true, confidence: 1, margin: 1, recognizedRatio: 1}
        : this.classify(text);
    const lower = text.toLowerCase();

    if (classification.intent === 'unknown') {
      return {
        type: 'clarification',
        classification,
        text: 'Não consegui entender o pedido. Pode explicar de outro jeito ou dizer o que você espera que eu faça?'
      };
    }

    if (classification.intent === 'memory' && /(lembre|guarde|salve|registre)/.test(lower)) {
      const cleaned = text.replace(/^(lembre|guarde|salve|registre)( que)?/i, '').trim();
      return {
        type: 'memory',
        classification,
        result: this.memory.remember(cleaned)
      };
    }

    if (classification.intent === 'memory') {
      return {
        type: 'memory-search',
        classification,
        result: this.memory.search(text)
      };
    }

    if (classification.intent === 'video') {
      return {
        type: 'video-plan',
        classification,
        result: this.video.plan(text)
      };
    }

    if (classification.intent === 'code') {
      return {
        type: 'code',
        classification,
        result: this.code.process(text)
      };
    }

    return {
      type: 'chat',
      classification,
      text: 'Posso conversar localmente e recuperar memórias, mas meu conhecimento geral é limitado à base fornecida.',
      memories: this.memory.search(text, 3)
    };
  }

  exportModel() {
    return JSON.stringify({
      schemaVersion: '0.3.0',
      datasetVersion: this.datasetVersion,
      vectorizerVersion: 'word-bigram-tfidf-v1',
      model: this.model.toJSON(),
      labels: this.labels,
      vocab: this.vectorizer.vocab,
      idf: this.vectorizer.idf.slice(),
      router: {
        confidenceThreshold: this.router.confidenceThreshold,
        marginThreshold: this.router.marginThreshold,
        recognizedThreshold: this.router.recognizedThreshold
      }
    });
  }

  restoreModel(saved) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
      throw new Error('Modelo inválido: estrutura raiz ausente');
    }
    if (saved.schemaVersion !== '0.3.0') {
      throw new Error('Modelo incompatível: schemaVersion diferente de 0.3.0');
    }
    if (saved.vectorizerVersion !== 'word-bigram-tfidf-v1') {
      throw new Error('Modelo incompatível: versão do vetorizador diferente');
    }
    if (saved.datasetVersion !== this.datasetVersion) {
      throw new Error('Modelo incompatível: versão do dataset diferente');
    }
    if (!isUniqueStringArray(saved.labels) || !isUniqueStringArray(saved.vocab)) {
      throw new Error('Modelo inválido: labels ou vocabulário inválidos');
    }
    if (!Array.isArray(saved.idf) || saved.idf.length !== saved.vocab.length
      || !saved.idf.every(value => Number.isFinite(value) && value > 0)) {
      throw new Error('Modelo inválido: dimensões incompatíveis entre vocabulário e pesos IDF');
    }

    const expectedLabels = [...new Set(TRAIN_EXAMPLES.map(example => example.label))];
    if (saved.labels.length !== expectedLabels.length
      || expectedLabels.some(label => !saved.labels.includes(label))) {
      throw new Error('Modelo incompatível: conjunto de classes diferente');
    }

    const routerConfig = saved.router;
    if (!routerConfig
      || !isThreshold(routerConfig.confidenceThreshold)
      || !isThreshold(routerConfig.marginThreshold)
      || !isThreshold(routerConfig.recognizedThreshold)) {
      throw new Error('Modelo inválido: limites do roteador ausentes ou inválidos');
    }

    // A rede é reconstruída em uma instância separada; o estado atual não é tocado.
    const restoredModel = TinyMLP.fromJSON(saved.model);
    if (restoredModel.inputSize !== saved.vocab.length
      || restoredModel.outputSize !== saved.labels.length) {
      throw new Error('Modelo inválido: dimensões incompatíveis com labels/vocabulário');
    }

    const restoredLabels = saved.labels.slice();
    const restoredVectorizer = new TextVectorizer(restoredLabels, saved.vocab.slice(), saved.idf.slice());
    const restoredRouter = new IntentRouter({
      model: restoredModel,
      vectorizer: restoredVectorizer,
      labels: restoredLabels,
      confidenceThreshold: routerConfig.confidenceThreshold,
      marginThreshold: routerConfig.marginThreshold,
      recognizedThreshold: routerConfig.recognizedThreshold
    });
    const restoredTraining = this.encodeExamples(TRAIN_EXAMPLES, restoredVectorizer, restoredLabels);
    const restoredValidation = this.encodeExamples(VALIDATION_EXAMPLES, restoredVectorizer, restoredLabels);

    // Commit atômico do estado validado.
    this.model = restoredModel;
    this.vectorizer = restoredVectorizer;
    this.labels = restoredLabels;
    this.router = restoredRouter;
    this.training = restoredTraining;
    this.validation = restoredValidation;

    return true;
  }
}
