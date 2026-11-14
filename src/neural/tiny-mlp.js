export class TinyMLP {
  constructor({
    inputSize,
    hiddenSize = 16,
    outputSize,
    learningRate = 0.08,
    weightDecay = 0.0001,
    gradientClipNorm = 1,
    seed = 42
  } = {}) {
    if (!Number.isInteger(inputSize) || inputSize <= 0
      || !Number.isInteger(outputSize) || outputSize <= 0
      || !Number.isInteger(hiddenSize) || hiddenSize <= 0) {
      throw new Error('inputSize, hiddenSize e outputSize devem ser inteiros positivos');
    }
    if (!Number.isFinite(learningRate) || learningRate <= 0) {
      throw new Error('learningRate deve ser um número positivo e finito');
    }
    if (!Number.isFinite(weightDecay) || weightDecay < 0) {
      throw new Error('weightDecay deve ser um número finito não negativo');
    }
    if (!Number.isFinite(gradientClipNorm) || gradientClipNorm < 0) {
      throw new Error('gradientClipNorm deve ser zero ou um número positivo e finito');
    }
    if (!Number.isInteger(seed)) throw new Error('seed deve ser um inteiro');

    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;
    this.learningRate = learningRate;
    this.weightDecay = weightDecay;
    this.gradientClipNorm = gradientClipNorm;
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

  validateVector(x) {
    if ((!Array.isArray(x) && !ArrayBuffer.isView(x))
      || x.length !== this.inputSize
      || !Array.from(x).every(Number.isFinite)) {
      throw new Error('Entrada inválida: esperado vetor finito de tamanho ' + this.inputSize + '.');
    }
  }

  static softmax(values) {
    if (!Array.isArray(values) || values.length === 0 || !values.every(Number.isFinite)) {
      throw new Error('Softmax requer logits finitos e não vazios.');
    }
    const max = Math.max(...values);
    const exponentials = values.map(value => Math.exp(value - max));
    const sum = exponentials.reduce((total, value) => total + value, 0);
    if (!Number.isFinite(sum) || sum <= 0) throw new Error('Não foi possível normalizar os logits.');
    return exponentials.map(value => value / sum);
  }

  forward(x) {
    this.validateVector(x);
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

  trainBatch(batch, options = {}) {
    if (!Array.isArray(batch) || batch.length === 0) return 0;
    const weightDecay = options.weightDecay ?? this.weightDecay;
    const gradientClipNorm = options.gradientClipNorm ?? this.gradientClipNorm;
    if (!Number.isFinite(weightDecay) || weightDecay < 0) throw new RangeError('weightDecay inválido.');
    if (!Number.isFinite(gradientClipNorm) || gradientClipNorm < 0) throw new RangeError('gradientClipNorm inválido.');

    const gradW1 = Array.from({length: this.hiddenSize}, () => Array(this.inputSize).fill(0));
    const gradB1 = Array(this.hiddenSize).fill(0);
    const gradW2 = Array.from({length: this.outputSize}, () => Array(this.hiddenSize).fill(0));
    const gradB2 = Array(this.outputSize).fill(0);
    let loss = 0;

    for (const {x, y} of batch) {
      this.validateVector(x);
      if (!Number.isInteger(y) || y < 0 || y >= this.outputSize) {
        throw new Error('Rótulo inválido no lote de treinamento.');
      }
      const {h, probs} = this.forward(x);
      loss -= Math.log(Math.max(probs[y], 1e-12));
      const dz2 = probs.map((probability, i) => probability - (i === y ? 1 : 0));

      for (let i = 0; i < this.outputSize; i++) {
        for (let j = 0; j < this.hiddenSize; j++) gradW2[i][j] += dz2[i] * h[j];
        gradB2[i] += dz2[i];
      }

      const dh = Array(this.hiddenSize).fill(0);
      for (let j = 0; j < this.hiddenSize; j++) {
        for (let i = 0; i < this.outputSize; i++) dh[j] += this.W2[i][j] * dz2[i];
      }
      for (let j = 0; j < this.hiddenSize; j++) {
        const dz1 = dh[j] * (1 - h[j] * h[j]);
        for (let k = 0; k < this.inputSize; k++) gradW1[j][k] += dz1 * x[k];
        gradB1[j] += dz1;
      }
    }

    // Average gradients before clipping so the threshold is independent of batch size.
    const inverseBatch = 1 / batch.length;
    let squaredNorm = 0;
    const accumulateNorm = value => { squaredNorm += value * value; };
    for (let i = 0; i < this.hiddenSize; i++) {
      for (let j = 0; j < this.inputSize; j++) accumulateNorm(gradW1[i][j] * inverseBatch);
      accumulateNorm(gradB1[i] * inverseBatch);
    }
    for (let i = 0; i < this.outputSize; i++) {
      for (let j = 0; j < this.hiddenSize; j++) accumulateNorm(gradW2[i][j] * inverseBatch);
      accumulateNorm(gradB2[i] * inverseBatch);
    }
    const gradientNorm = Math.sqrt(squaredNorm);
    const clipScale = gradientClipNorm > 0 && gradientNorm > gradientClipNorm
      ? gradientClipNorm / gradientNorm
      : 1;

    for (let i = 0; i < this.outputSize; i++) {
      for (let j = 0; j < this.hiddenSize; j++) {
        const gradient = gradW2[i][j] * inverseBatch * clipScale;
        this.W2[i][j] -= this.learningRate * (gradient + weightDecay * this.W2[i][j]);
      }
      this.b2[i] -= this.learningRate * gradB2[i] * inverseBatch * clipScale;
    }
    for (let i = 0; i < this.hiddenSize; i++) {
      for (let j = 0; j < this.inputSize; j++) {
        const gradient = gradW1[i][j] * inverseBatch * clipScale;
        this.W1[i][j] -= this.learningRate * (gradient + weightDecay * this.W1[i][j]);
      }
      this.b1[i] -= this.learningRate * gradB1[i] * inverseBatch * clipScale;
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

  train(dataset, options = {}) {
    const {
      epochs = 100,
      validation = [],
      batchSize = Array.isArray(dataset) ? dataset.length : 0,
      shuffle = true,
      patience = 20,
      weightDecay = this.weightDecay,
      gradientClipNorm = this.gradientClipNorm,
      onEpoch = () => {}
    } = options;

    const validateDataset = (items, name) => {
      if (!Array.isArray(items)) throw new TypeError(name + ' deve ser um array.');
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (!item || !Array.isArray(item.x) || item.x.length !== this.inputSize
          || !item.x.every(Number.isFinite)
          || !Number.isInteger(item.y) || item.y < 0 || item.y >= this.outputSize) {
          throw new Error(name + ' contém um exemplo inválido na posição ' + index + '.');
        }
      }
    };

    validateDataset(dataset, 'dataset');
    if (dataset.length === 0) throw new Error('dataset não pode estar vazio.');
    validateDataset(validation, 'validation');
    if (!Number.isInteger(epochs) || epochs < 1) throw new RangeError('epochs deve ser um inteiro positivo.');
    if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError('batchSize deve ser um inteiro positivo.');
    if (!Number.isInteger(patience) || patience < 1) throw new RangeError('patience deve ser um inteiro positivo.');
    if (!Number.isFinite(weightDecay) || weightDecay < 0) throw new RangeError('weightDecay deve ser não negativo.');
    if (!Number.isFinite(gradientClipNorm) || gradientClipNorm < 0) throw new RangeError('gradientClipNorm deve ser não negativo.');
    if (typeof shuffle !== 'boolean') throw new TypeError('shuffle deve ser booleano.');
    if (typeof onEpoch !== 'function') throw new TypeError('onEpoch deve ser uma função.');

    const history = [];
    let bestLoss = Infinity;
    let bestWeights = null;
    let bestEpoch = 0;
    let staleEpochs = 0;

    for (let epoch = 1; epoch <= epochs; epoch++) {
      const ordered = shuffle ? this.shuffle(dataset, this.seed + epoch) : dataset;
      for (let i = 0; i < ordered.length; i += batchSize) {
        this.trainBatch(ordered.slice(i, i + batchSize), {weightDecay, gradientClipNorm});
      }

      const train = this.evaluate(dataset);
      const validationResult = validation.length ? this.evaluate(validation) : null;
      const score = validationResult?.loss ?? train.loss;
      const row = {epoch, loss: train.loss, ...train, validation: validationResult};
      history.push(row);
      onEpoch(row);

      if (score < bestLoss) {
        bestLoss = score;
        bestEpoch = epoch;
        bestWeights = this.toJSON();
        staleEpochs = 0;
      } else if (++staleEpochs >= patience) {
        break;
      }
    }

    if (bestWeights) Object.assign(this, TinyMLP.fromJSON(bestWeights));
    history.bestEpoch = bestEpoch;
    history.bestLoss = bestLoss;
    return history;
  }

  toJSON() {
    return {
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
      outputSize: this.outputSize,
      learningRate: this.learningRate,
      weightDecay: this.weightDecay,
      gradientClipNorm: this.gradientClipNorm,
      seed: this.seed,
      step: this.step,
      W1: this.W1.map(row => row.slice()),
      b1: this.b1.slice(),
      W2: this.W2.map(row => row.slice()),
      b2: this.b2.slice()
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
      || (data.weightDecay !== undefined && (!Number.isFinite(data.weightDecay) || data.weightDecay < 0))
      || (data.gradientClipNorm !== undefined && (!Number.isFinite(data.gradientClipNorm) || data.gradientClipNorm < 0))
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
      weightDecay: data.weightDecay ?? 0.0001,
      gradientClipNorm: data.gradientClipNorm ?? 1,
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
  constructor(labels, vocab, idf = null) {
    if (!Array.isArray(labels) || !Array.isArray(vocab) || !vocab.length) {
      throw new TypeError('labels e vocab devem ser arrays não vazios.');
    }
    this.labels = labels.slice();
    this.vocab = vocab.slice();
    this.index = new Map(this.vocab.map((token, index) => [token, index]));
    this.idf = Array.isArray(idf) && idf.length === vocab.length ? idf.slice() : Array(vocab.length).fill(1);
  }

  tokenize(text) {
    return String(text ?? '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9_]+/g) || [];
  }

  documentFeatures(text) {
    const tokens = this.tokenize(text);
    const features = new Set(tokens.map(token => 'u:' + token));
    for (let index = 0; index < tokens.length - 1; index++) {
      features.add('b:' + tokens[index] + '_' + tokens[index + 1]);
    }
    return features;
  }

  encode(text) {
    const tokens = this.tokenize(text);
    const counts = new Map();
    const unigramWeight = 1 / Math.max(tokens.length, 1);
    for (const token of tokens) {
      const key = 'u:' + token;
      counts.set(key, (counts.get(key) || 0) + unigramWeight);
    }
    const bigramDenominator = Math.max(tokens.length - 1, 1);
    for (let index = 0; index < tokens.length - 1; index++) {
      const key = 'b:' + tokens[index] + '_' + tokens[index + 1];
      counts.set(key, (counts.get(key) || 0) + 0.65 / bigramDenominator);
    }

    const vector = Array(this.vocab.length).fill(0);
    for (const [feature, count] of counts) {
      const index = this.index.get(feature);
      if (index !== undefined) vector[index] = count * this.idf[index];
    }
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return norm > 0 ? vector.map(value => value / norm) : vector;
  }

  recognizedRatio(text) {
    const tokens = this.tokenize(text);
    return tokens.length
      ? tokens.filter(token => this.index.has('u:' + token)).length / tokens.length
      : 0;
  }

  static fromExamples(examples) {
    if (!Array.isArray(examples) || !examples.length) throw new Error('examples deve ser um array não vazio.');
    const labels = [...new Set(examples.map(example => example.label))];
    const docs = examples.map(example => {
      if (!example || typeof example.text !== 'string' || !labels.includes(example.label)) {
        throw new Error('Exemplo inválido para construir o vocabulário.');
      }
      const tokens = String(example.text).toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9_]+/g) || [];
      const features = new Set(tokens.map(token => 'u:' + token));
      for (let index = 0; index < tokens.length - 1; index++) {
        features.add('b:' + tokens[index] + '_' + tokens[index + 1]);
      }
      return features;
    });
    const documentFrequency = new Map();
    for (const features of docs) {
      for (const feature of features) documentFrequency.set(feature, (documentFrequency.get(feature) || 0) + 1);
    }
    const vocab = [...documentFrequency.keys()];
    const idf = vocab.map(feature => Math.log((docs.length + 1) / (documentFrequency.get(feature) + 1)) + 1);
    return {vectorizer: new TextVectorizer(labels, vocab, idf), labels};
  }
}
