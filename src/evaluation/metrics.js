export function classificationMetrics(predictions, labels) {
  const actualClasses = [...new Set([
    ...labels,
    ...predictions.map(prediction => prediction.actual)
  ])];
  const predictedClasses = [...new Set([
    ...labels,
    'unknown',
    ...predictions.map(prediction => prediction.predicted)
  ])];

  // "unknown" é uma previsão válida e precisa aparecer na matriz de confusão.
  const confusionMatrix = Object.fromEntries(
    actualClasses.map(actual => [
      actual,
      Object.fromEntries(predictedClasses.map(predicted => [predicted, 0]))
    ])
  );

  for (const prediction of predictions) {
    if (confusionMatrix[prediction.actual]
      && Object.hasOwn(confusionMatrix[prediction.actual], prediction.predicted)) {
      confusionMatrix[prediction.actual][prediction.predicted]++;
    }
  }

  const perClass = {};
  for (const label of actualClasses) {
    const truePositive = predictions.filter(
      prediction => prediction.actual === label && prediction.predicted === label
    ).length;
    const falsePositive = predictions.filter(
      prediction => prediction.actual !== label && prediction.predicted === label
    ).length;
    const falseNegative = predictions.filter(
      prediction => prediction.actual === label && prediction.predicted !== label
    ).length;

    const precision = truePositive / (truePositive + falsePositive || 1);
    const recall = truePositive / (truePositive + falseNegative || 1);
    const f1 = 2 * precision * recall / (precision + recall || 1);

    perClass[label] = {
      precision,
      recall,
      f1,
      support: truePositive + falseNegative
    };
  }

  // Classes sem exemplos reais não distorcem a média macro.
  const supportedClasses = actualClasses.filter(label => perClass[label].support > 0);
  const macro = supportedClasses.reduce((totals, label) => ({
    precision: totals.precision + perClass[label].precision,
    recall: totals.recall + perClass[label].recall,
    f1: totals.f1 + perClass[label].f1
  }), {precision: 0, recall: 0, f1: 0});

  if (supportedClasses.length) {
    for (const metric of Object.keys(macro)) {
      macro[metric] /= supportedClasses.length;
    }
  }

  return {
    accuracy: predictions.filter(
      prediction => prediction.predicted === prediction.actual
    ).length / (predictions.length || 1),
    macro: {...macro, supportedClasses: supportedClasses.length},
    perClass,
    confusionMatrix
  };
}

export function rejectionMetrics(knownPredictions, unknownPredictions) {
  return {
    knownRejected: knownPredictions.filter(
      prediction => prediction.predicted === 'unknown'
    ).length / (knownPredictions.length || 1),
    unknownAccepted: unknownPredictions.filter(
      prediction => prediction.predicted !== 'unknown'
    ).length / (unknownPredictions.length || 1),
    unknownRejected: unknownPredictions.filter(
      prediction => prediction.predicted === 'unknown'
    ).length / (unknownPredictions.length || 1)
  };
}
