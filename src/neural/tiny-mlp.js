export class TinyMLP {
  constructor({inputSize, hiddenSize = 16, outputSize, learningRate = 0.08, seed = 42} = {}) {
    if (!Number.isInteger(inputSize) || inputSize <= 0
      || !Number.isInteger(outputSize) || outputSize <= 0
      || !Number.isInteger(hiddenSize) || hiddenSize <= 0) {
      throw new Error('inputSize, hiddenSize e outputSize devem ser inteiros positivos');
    }

    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;
    this.learningRate = learningRate;
    this.seed = seed;
    this.step = 0;

    const rand = this.rng(seed);
    this.W1 = Array.from(
      {length: hiddenSize},
      () => Array.from({length: inputSize}, () => (rand() * 2 - 1) * Math.sqrt(2 / inputSize))
    );
    this.b1 = Array(hiddenSize).fill(0);
    this.W2 = Array.from(
      {length: outputSize},
      () => Array.from({length: hiddenSize}, () => (rand() * 2 - 1) * Math.sqrt(2 / hiddenSize))
    );
    this.b2 = Array(outputSize).fill(0);
  }

  rng(seed) {
    let state = seed >>> 0;
    return () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  shuffle(items, seed) {
    const shuffled = items.slice();
    const rand = this.rng(seed);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  static softmax(values) {
    const max = Math.max(...values);
    const exponentials = values.map(value => Math.exp(value - max));
    const sum = exponentials.reduce((total, value) => total + value, 0);
    return exponentials.map(value => value / sum);
  }

  forward(x) {
    const hidden = this.W1.map((row, i) => Math.tanh(
      row.reduce((sum, weight, j) => sum + weight * x[j], this.b1[i])
    ));
    const logits = this.W2.map((row, i) => row.reduce(
      (sum, weight, j) => sum + weight * hidden[j],
      this.b2[i]
    ));
    return {h: hidden, probs: TinyMLP.softmax(logits)};
  }

  predict(x) {
    const probabilities = this.forward(x).probs;
    let index = 0;
    probabilities.forEach((probability, i) => {
      if (probability > probabilities[index]) index = i;
    });
    const sorted = probabilities.slice().sort((a, b) => b - a);
    return {
      index,
      confidence: probabilities[index],
      margin: sorted[0] - (sorted[1] ?? 0),
      probabilities
    };
  }

  trainBatch(batch) {
    if (!batch.length) return 0;

    const gradW1 = Array.from({length: this.hiddenSize}, () => Array(this.inputSize).fill(0));
    const gradB1 = Array(this.hiddenSize).fill(0);
    const gradW2 = Array.from({length: this.outputSize}, () => Array(this.hiddenSize).fill(0));
    const gradB2 = Array(this.outputSize).fill(0);
    let loss = 0;

    for (const {x, y} of batch) {
      const {h, probs} = this.forward(x);
      loss -= Math.log(Math.max(probs[y], 1e-12));
      const dz2 = probs.map((probability, i) => probability - (i === y ? 1 : 0));

      for (let i = 0; i < this.outputSize; i++) {
        for (let j = 0; j < this.hiddenSize; j++) {
          gradW2[i][j] += dz2[i] * h[j];
        }
        gradB2[i] += dz2[i];
      }

      const dh = Array(this.hiddenSize).fill(0);
      for (let j = 0; j < this.hiddenSize; j++) {
        for (let i = 0; i < this.outputSize; i++) {
          dh[j] += this.W2[i][j] * dz2[i];
        }
      }
      for (let j = 0; j < this.hiddenSize; j++) {
        const dz1 = dh[j] * (1 - h[j] * h[j]);
        for (let k = 0; k < this.inputSize; k++) gradW1[j][k] += dz1 * x[k];
        gradB1[j] += dz1;
      }
    }

    const scale = this.learningRate / batch.length;
    for (let i = 0; i < this.outputSize; i++) {
      for (let j = 0; j < this.hiddenSize; j++) this.W2[i][j] -= scale * gradW2[i][j];
      this.b2[i] -= scale * gradB2[i];
    }
    for (let j = 0; j < this.hiddenSize; j++) {
      for (let k = 0; k < this.inputSize; k++) this.W1[j][k] -= scale * gradW1[j][k];
      this.b1[j] -= scale * gradB1[j];
    }

    this.step++;
    return loss / batch.length;
  }

  evaluate(dataset) {
    let loss = 0;
    let correct = 0;
    for (const item of dataset) {
      const prediction = this.predict(item.x);
      loss -= Math.log(Math.max(prediction.probabilities[item.y], 1e-12));
      if (prediction.index === item.y) correct++;
    }
    return {
      loss: dataset.length ? loss / dataset.length : 0,
      accuracy: dataset.length ? correct / dataset.length : 0
    };
  }

  train(dataset, {epochs = 100, validation = [], batchSize = dataset.length, shuffle = true, patience = 20, onEpoch = () => {}} = {}) {
    const history = [];
    let bestLoss = Infinity;
    let bestWeights = null;
    let staleEpochs = 0;

    for (let epoch = 1; epoch <= epochs; epoch++) {
      const ordered = shuffle ? this.shuffle(dataset, this.seed + epoch) : dataset;
      for (let i = 0; i < ordered.length; i += batchSize) {
        this.trainBatch(ordered.slice(i, i + batchSize));
      }

      const train = this.evaluate(dataset);
      const validationResult = validation.length ? this.evaluate(validation) : null;
      const score = validationResult?.loss ?? train.loss;
      const row = {epoch, loss: train.loss, ...train, validation: validationResult};
      history.push(row);
      onEpoch(row);

      if (score < bestLoss) {
        bestLoss = score;
        bestWeights = this.toJSON();
        staleEpochs = 0;
      } else if (++staleEpochs >= patience) {
        break;
      }
    }

    if (bestWeights) Object.assign(this, TinyMLP.fromJSON(bestWeights));
    return history;
  }

  toJSON() {
    return {
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
      outputSize: this.outputSize,
      learningRate: this.learningRate,
      seed: this.seed,
      step: this.step,
      W1: this.W1,
      b1: this.b1,
      W2: this.W2,
      b2: this.b2
    };
  }

  static fromJSON(data) {
    const isPositiveInteger = value => Number.isInteger(value) && value > 0;
    const isNonNegativeInteger = value => Number.isInteger(value) && value >= 0;
    const isFiniteVector = (value, length) => Array.isArray(value)
      && value.length === length
      && value.every(Number.isFinite);
    const isFiniteMatrix = (value, rows, columns) => Array.isArray(value)
      && value.length === rows
      && value.every(row => isFiniteVector(row, columns));

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Modelo inválido: estrutura da rede ausente');
    }
    if (!isPositiveInteger(data.inputSize)
      || !isPositiveInteger(data.hiddenSize)
      || !isPositiveInteger(data.outputSize)
      || !Number.isFinite(data.learningRate)
      || data.learningRate <= 0
      || !Number.isInteger(data.seed)
      || !isNonNegativeInteger(data.step)
      || !isFiniteMatrix(data.W1, data.hiddenSize, data.inputSize)
      || !isFiniteVector(data.b1, data.hiddenSize)
      || !isFiniteMatrix(data.W2, data.outputSize, data.hiddenSize)
      || !isFiniteVector(data.b2, data.outputSize)) {
      throw new Error('Modelo inválido: dimensões ou valores dos pesos incorretos');
    }

    const model = new TinyMLP({
      inputSize: data.inputSize,
      hiddenSize: data.hiddenSize,
      outputSize: data.outputSize,
      learningRate: data.learningRate,
      seed: data.seed
    });
    model.step = data.step;
    model.W1 = data.W1.map(row => row.slice());
    model.b1 = data.b1.slice();
    model.W2 = data.W2.map(row => row.slice());
    model.b2 = data.b2.slice();
    return model;
  }
}

export class TextVectorizer {
  constructor(labels, vocab) {
    this.labels = labels;
    this.vocab = vocab;
  }

  tokenize(text) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9_]+/g) || [];
  }

  encode(text) {
    const tokens = this.tokenize(text);
    const vector = Array(this.vocab.length).fill(0);
    for (const token of tokens) {
      const index = this.vocab.indexOf(token);
      if (index >= 0) vector[index]++;
    }
    const denominator = Math.max(tokens.length, 1);
    return vector.map(value => value / denominator);
  }

  recognizedRatio(text) {
    const tokens = this.tokenize(text);
    return tokens.length
      ? tokens.filter(token => this.vocab.includes(token)).length / tokens.length
      : 0;
  }

  static fromExamples(examples) {
    const labels = [...new Set(examples.map(example => example.label))];
    const vocab = [...new Set(examples.flatMap(example => (
      example.text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9_]+/g) || []
    )))];
    return {vectorizer: new TextVectorizer(labels, vocab), labels};
  }
}
