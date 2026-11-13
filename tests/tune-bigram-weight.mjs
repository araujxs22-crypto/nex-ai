import {NexCore} from '../src/index.js';
import {classificationMetrics, rejectionMetrics} from '../src/evaluation/metrics.js';
import {TRAIN_EXAMPLES, VALIDATION_EXAMPLES} from '../data/training-data.js';

const candidateWeights = [0, 0.05, 0.1, 0.25, 0.5, 0.75, 1];
const results = [];

for (const weight of candidateWeights) {
  const core = new NexCore();
  core.chat.vectorizer.bigramWeight = weight;
  core.chat.training = core.chat.encodeExamples(TRAIN_EXAMPLES);
  core.chat.validation = core.chat.encodeExamples(VALIDATION_EXAMPLES);

  const history = core.train({epochs: 500, patience: 60});
  const predictions = VALIDATION_EXAMPLES.map(example => {
    const classification = core.chat.classify(example.text);
    return {...classification, actual: example.label, predicted: classification.intent};
  });
  const metrics = classificationMetrics(predictions, core.chat.labels);
  const known = predictions.filter(example => example.actual !== 'unknown');
  const unknown = predictions.filter(example => example.actual === 'unknown');
  const rejection = rejectionMetrics(known, unknown);

  results.push({
    bigramWeight: weight,
    validationAccuracy: metrics.accuracy,
    validationMacroF1: metrics.macro.f1,
    knownRejected: rejection.knownRejected,
    validationUnknownRejected: rejection.unknownRejected,
    epochs: history.length
  });
}

results.sort((a, b) => b.validationMacroF1 - a.validationMacroF1);
console.log(JSON.stringify({
  selectionMethod: 'validation macro-F1; test set not used for tuning',
  candidates: results,
  selected: results[0]
}, null, 2));
