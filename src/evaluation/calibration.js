function accepts(prediction, thresholds) {
  return prediction.confidence >= thresholds.confidenceThreshold
    && prediction.margin >= thresholds.marginThreshold
    && prediction.recognizedRatio >= thresholds.recognizedThreshold;
}

function harmonicMean(a, b) {
  return a + b > 0 ? 2 * a * b / (a + b) : 0;
}

/**
 * Calibrates the router using only labeled validation prompts and a separate
 * out-of-domain calibration set. The final test examples are never consumed.
 */
export function calibrateRejectionThresholds({
  knownExamples,
  outOfDomainExamples,
  classifyRaw,
  minKnownCoverage = 0.75,
  confidenceCandidates = [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6],
  marginCandidates = [0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.15, 0.18],
  recognizedCandidates = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4]
} = {}) {
  if (!Array.isArray(knownExamples) || knownExamples.length === 0
    || !Array.isArray(outOfDomainExamples) || outOfDomainExamples.length === 0
    || typeof classifyRaw !== 'function') {
    throw new Error('Calibração exige exemplos conhecidos, exemplos OOD e classificador bruto');
  }
  if (!Number.isFinite(minKnownCoverage) || minKnownCoverage <= 0 || minKnownCoverage > 1) {
    throw new Error('minKnownCoverage deve estar entre 0 e 1');
  }

  const known = knownExamples.map(example => ({
    actual: example.label,
    prediction: classifyRaw(example.text)
  }));
  const outOfDomain = outOfDomainExamples.map(text => classifyRaw(text));
  const candidates = [];

  for (const confidenceThreshold of confidenceCandidates) {
    for (const marginThreshold of marginCandidates) {
      for (const recognizedThreshold of recognizedCandidates) {
        const thresholds = {
          confidenceThreshold,
          marginThreshold,
          recognizedThreshold
        };
        const acceptedKnown = known.filter(item => accepts(item.prediction, thresholds));
        const correctKnown = acceptedKnown.filter(
          item => item.prediction.rawIntent === item.actual
        ).length;
        const knownCoverage = acceptedKnown.length / known.length;
        const knownAccuracy = correctKnown / known.length;
        const outOfDomainRejected = outOfDomain.filter(
          prediction => !accepts(prediction, thresholds)
        ).length / outOfDomain.length;

        if (knownCoverage < minKnownCoverage) continue;

        candidates.push({
          thresholds,
          knownCoverage,
          knownAccuracy,
          outOfDomainRejected,
          score: harmonicMean(knownAccuracy, outOfDomainRejected)
        });
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error('Nenhum conjunto de limites respeitou a cobertura mínima de comandos conhecidos');
  }

  candidates.sort((a, b) => (
    b.score - a.score
    || b.knownAccuracy - a.knownAccuracy
    || b.outOfDomainRejected - a.outOfDomainRejected
  ));

  return {
    thresholds: candidates[0].thresholds,
    metrics: {
      knownCoverage: candidates[0].knownCoverage,
      knownAccuracy: candidates[0].knownAccuracy,
      outOfDomainRejected: candidates[0].outOfDomainRejected,
      harmonicScore: candidates[0].score,
      knownExamples: known.length,
      outOfDomainExamples: outOfDomain.length,
      candidatesEvaluated: candidates.length,
      minKnownCoverage
    }
  };
}
