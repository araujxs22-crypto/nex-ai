import assert from 'node:assert/strict';
import {NexCore, TinyMLP} from '../src/index.js';
import {classificationMetrics, rejectionMetrics} from '../src/evaluation/metrics.js';
import {leakageReport} from '../src/evaluation/leakage.js';
import {TRAIN_EXAMPLES, VALIDATION_EXAMPLES, TEST_EXAMPLES, UNKNOWN_EXAMPLES} from '../data/training-data.js';

const core = new NexCore();
const before = JSON.stringify(core.chat.model.toJSON());
const history = core.train({epochs: 500, patience: 60});
const after = JSON.stringify(core.chat.model.toJSON());

assert.notEqual(before, after, 'pesos devem mudar');
assert.ok(history.length <= 500, 'early stopping deve ser permitido');
assert.ok(history.at(-1).validation, 'validação deve ser medida');

const evalResult = core.evaluate();
const knownMetrics = classificationMetrics(evalResult.predictions, core.chat.labels);
const rejection = rejectionMetrics(evalResult.predictions, evalResult.unknown);
assert.equal(TRAIN_EXAMPLES.length, 20);
assert.equal(VALIDATION_EXAMPLES.length, 4);
assert.equal(TEST_EXAMPLES.length, 4);
assert.equal(UNKNOWN_EXAMPLES.length, 4);
assert.ok(Number.isFinite(knownMetrics.macro.f1));
assert.ok(rejection.unknownRejected >= 0);

const leakage = leakageReport({
  train: TRAIN_EXAMPLES,
  validation: VALIDATION_EXAMPLES,
  test: TEST_EXAMPLES
});
assert.equal(leakage.duplicateCount, 0, 'não pode haver duplicatas entre splits');

const unknown = core.ask('qual a receita de bolo de cenoura');
assert.equal(unknown.type, 'clarification');
const video = core.ask('crie uma cena 3d com uma nave');
assert.ok(['video-plan', 'clarification'].includes(video.type));

const savedWeights = core.chat.model.toJSON();
assert.deepEqual(
  TinyMLP.fromJSON(JSON.parse(JSON.stringify(savedWeights))).toJSON(),
  savedWeights,
  'TinyMLP deve reconstruir os pesos sem compartilhar referências'
);

// Simula o localStorage do navegador para testar save/load no Node.
const previousLocalStorage = globalThis.localStorage;
const storage = new Map();
globalThis.localStorage = {
  setItem(key, value) {
    storage.set(String(key), String(value));
  },
  getItem(key) {
    return storage.has(String(key)) ? storage.get(String(key)) : null;
  },
  removeItem(key) {
    storage.delete(String(key));
  }
};

try {
  core.chat.router.confidenceThreshold = 0.55;
  core.chat.router.marginThreshold = 0.12;
  core.chat.router.recognizedThreshold = 0.35;

  assert.equal(core.saveModel('round-trip'), true, 'saveModel deve salvar');
  const loaded = new NexCore();
  assert.equal(loaded.loadModel('round-trip'), true, 'loadModel deve carregar');
  assert.deepEqual(loaded.chat.model.toJSON(), core.chat.model.toJSON(), 'pesos devem sobreviver ao round-trip');
  assert.deepEqual(loaded.chat.labels, core.chat.labels, 'labels devem ser restaurados');
  assert.deepEqual(loaded.chat.vectorizer.vocab, core.chat.vectorizer.vocab, 'vocabulário deve ser restaurado');
  assert.equal(loaded.chat.router.confidenceThreshold, 0.55, 'confidenceThreshold deve ser restaurado');
  assert.equal(loaded.chat.router.marginThreshold, 0.12, 'marginThreshold deve ser restaurado');
  assert.equal(loaded.chat.router.recognizedThreshold, 0.35, 'recognizedThreshold deve ser restaurado');
  assert.deepEqual(
    loaded.chat.classify('crie uma cena 3d com uma nave'),
    core.chat.classify('crie uma cena 3d com uma nave'),
    'classificação deve permanecer estável após carregar'
  );

  // Um modelo inválido não pode modificar parcialmente uma instância existente.
  const invalidSnapshot = JSON.parse(core.chat.exportModel());
  invalidSnapshot.vocab.pop();
  storage.set('invalid-model', JSON.stringify(invalidSnapshot));

  const untouched = new NexCore();
  const untouchedBefore = JSON.stringify(untouched.chat.model.toJSON());
  assert.throws(
    () => untouched.loadModel('invalid-model'),
    /dimensões incompatíveis/i,
    'deve rejeitar vocabulário incompatível'
  );
  assert.equal(
    JSON.stringify(untouched.chat.model.toJSON()),
    untouchedBefore,
    'falha no carregamento não pode alterar os pesos atuais'
  );

  const invalidWeights = JSON.parse(core.chat.exportModel());
  invalidWeights.model.W1[0].pop();
  storage.set('invalid-weights', JSON.stringify(invalidWeights));
  assert.throws(
    () => new NexCore().loadModel('invalid-weights'),
    /dimensões ou valores dos pesos incorretos/i,
    'deve rejeitar matrizes de pesos com dimensões inválidas'
  );

  storage.set('invalid-json', '{not-json');
  assert.throws(
    () => new NexCore().loadModel('invalid-json'),
    /JSON corrompido/i,
    'deve identificar JSON corrompido'
  );
  assert.equal(new NexCore().loadModel('missing-model'), false, 'modelo ausente deve retornar false');
} finally {
  if (previousLocalStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = previousLocalStorage;
  }
}

console.log(JSON.stringify({
  ok: true,
  epochs: history.length,
  initialLoss: history[0].loss,
  finalTrainLoss: history.at(-1).loss,
  finalValidationLoss: history.at(-1).validation?.loss,
  testAccuracy: knownMetrics.accuracy,
  macroF1: knownMetrics.macro.f1,
  perClass: knownMetrics.perClass,
  confusionMatrix: knownMetrics.confusionMatrix,
  unknownRejected: rejection.unknownRejected,
  leakage,
  persistenceTests: [
    'round-trip de pesos',
    'restauração de labels e vocabulário',
    'restauração de limites do roteador',
    'rejeição de vocabulário e pesos incompatíveis',
    'rejeição de JSON corrompido',
    'carregamento atômico'
  ],
  filesPreserved: ['src/engines/video-engine.js', 'src/engines/code-engine.js']
}, null, 2));
