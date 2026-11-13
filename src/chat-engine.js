import {TinyMLP, TextVectorizer} from './neural/tiny-mlp.js';
import {IntentRouter} from './intent-router.js';
import {respondToSocialMessage} from './dialogue.js';
import {calibrateRejectionThresholds} from './evaluation/calibration.js';
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

    const {vectorizer, labels} = TextVectorizer.fromExamples(TRAIN_EXAMPLES);
    this.vectorizer = vectorizer;
    this.labels = labels;
    this.model = model || new TinyMLP({
      inputSize: vectorizer.vocab.length,
      hiddenSize: 12,
      outputSize: labels.length,
      learningRate: 0.5,
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
      epochs: options.epochs ?? 500,
      validation: this.validation,
      batchSize: options.batchSize ?? this.training.length,
      patience: options.patience ?? 60,
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

    const classification = this.classify(text);
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
      schemaVersion: '0.2.0',
      datasetVersion: this.datasetVersion,
      model: this.model.toJSON(),
      labels: this.labels,
      vocab: this.vectorizer.vocab,
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
    if (saved.schemaVersion !== '0.2.0') {
      throw new Error('Modelo incompatível: schemaVersion diferente de 0.2.0');
    }
    if (saved.datasetVersion !== this.datasetVersion) {
      throw new Error('Modelo incompatível: versão do dataset diferente');
    }
    if (!isUniqueStringArray(saved.labels) || !isUniqueStringArray(saved.vocab)) {
      throw new Error('Modelo inválido: labels ou vocabulário inválidos');
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
    const restoredVectorizer = new TextVectorizer(restoredLabels, saved.vocab.slice());
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
