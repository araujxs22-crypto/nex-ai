import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {NexCore, TinyMLP, NexMemory} from '../src/index.js';
import {NexCodeEngine} from '../src/engines/code-engine.js';
import {classificationMetrics, rejectionMetrics} from '../src/evaluation/metrics.js';
import {leakageReport} from '../src/evaluation/leakage.js';
import {TRAIN_EXAMPLES, VALIDATION_EXAMPLES, TEST_EXAMPLES, UNKNOWN_EXAMPLES, UNKNOWN_CALIBRATION_EXAMPLES} from '../data/training-data.js';


const codeEngine = new NexCodeEngine();

const checkpointModel = new TinyMLP({inputSize: 1, hiddenSize: 2, outputSize: 2});
const detachedCheckpoint = checkpointModel.toJSON();
const originalWeight = detachedCheckpoint.W1[0][0];
checkpointModel.W1[0][0] += 10;
assert.equal(detachedCheckpoint.W1[0][0], originalWeight, 'toJSON deve devolver pesos independentes');
assert.throws(() => checkpointModel.train([{x: [0], y: 0}], {batchSize: 0}), /batchSize/);
assert.throws(() => checkpointModel.train([{x: [0], y: 2}]), /exemplo inválido/);
assert.throws(() => checkpointModel.train([]), /vazio/);

const memoryBacking = new Map();
const memoryStorage = {
  getItem(key) { return memoryBacking.has(key) ? memoryBacking.get(key) : null; },
  setItem(key, value) { memoryBacking.set(key, String(value)); }
};
const hardenedMemory = new NexMemory({key: 'reliability-test', storage: memoryStorage, maxItems: 3});
const remembered = hardenedMemory.remember('Uma cena espacial com uma nave', {title: 'Projeto espacial', tags: ['3D']});
assert.equal(hardenedMemory.search('projeto espacial')[0].id, remembered.id, 'busca deve considerar título e texto');
assert.throws(() => hardenedMemory.remember('   '), /vazia/);
assert.equal(hardenedMemory.import(hardenedMemory.export()), 1);
assert.throws(() => hardenedMemory.import('{quebrado'), /JSON corrompido/);
const quotaMemory = new NexMemory({storage: {getItem: () => null, setItem: () => { throw new Error('quota'); }}});
assert.throws(() => quotaMemory.remember('não deve confirmar gravação'), /persistir/);
assert.equal(quotaMemory.all().length, 0, 'falha de persistência deve reverter a memória em RAM');


const validJs = codeEngine.analyze(
  'const total = 3;\nif (total === 3) {\n  console.log("ok");\n}',
  'javascript'
);
assert.equal(validJs.valid, true, 'JavaScript estruturalmente balanceado deve passar');
assert.equal(validJs.language, 'javascript');
assert.ok(validJs.diagnostics.some(item => item.code === 'JS_CONSOLE_LOG'));

const invalidJs = codeEngine.analyze(
  'function greet( {\n  const name;\n  const value = ;\n  eval("alert(1)");\n}',
  'javascript'
);
assert.equal(invalidJs.valid, false, 'JavaScript com delimitadores e atribuições inválidas deve falhar');
assert.ok(invalidJs.diagnostics.some(item => item.code === 'UNCLOSED_DELIMITER'));

const mismatchedJs = codeEngine.analyze('const items = [1, 2);', 'javascript');
assert.ok(mismatchedJs.diagnostics.some(item => item.code === 'MISMATCHED_DELIMITER'));
assert.ok(invalidJs.diagnostics.some(item => item.code === 'JS_CONST_WITHOUT_INITIALIZER'));
assert.ok(invalidJs.diagnostics.some(item => item.code === 'JS_EMPTY_ASSIGNMENT'));
assert.ok(invalidJs.diagnostics.some(item => item.code === 'JS_EVAL_USAGE'));
assert.ok(invalidJs.diagnostics.every(item => Number.isInteger(item.line) && Number.isInteger(item.column)));

const unterminatedString = codeEngine.analyze('const message = "hello;', 'javascript');
assert.ok(unterminatedString.diagnostics.some(item => item.code === 'JS_UNTERMINATED_STRING'));

const pythonResult = codeEngine.analyze(
  'def greet(name)\n    value =\n    return name',
  'python'
);
assert.equal(pythonResult.valid, false);
assert.ok(pythonResult.diagnostics.some(item => item.code === 'PY_MISSING_COLON'));
assert.ok(pythonResult.diagnostics.some(item => item.code === 'PY_EMPTY_ASSIGNMENT'));

const htmlResult = codeEngine.analyze(
  '<div id="app"><span></div><p id="app">x</p>',
  'html'
);
assert.equal(htmlResult.valid, false);
assert.ok(htmlResult.diagnostics.some(item => item.code === 'HTML_MISMATCHED_TAG'));
assert.ok(htmlResult.diagnostics.some(item => item.code === 'HTML_DUPLICATE_ID'));

assert.equal(codeEngine.detectLanguage('def main():\n    return 1'), 'python');
assert.equal(codeEngine.detectLanguage('<html><body></body></html>'), 'html');
assert.equal(codeEngine.detectLanguage('const x = 1;'), 'javascript');

const fence = String.fromCharCode(96).repeat(3);
const fencedRequest = codeEngine.process('Analise este trecho:\n' + fence + 'javascript\nconst count;\n' + fence);
assert.equal(fencedRequest.type, 'analysis');
assert.ok(fencedRequest.result.diagnostics.some(item => item.code === 'JS_CONST_WITHOUT_INITIALIZER'));


const websiteScaffold = codeEngine.scaffold('crie um site responsivo para uma barbearia');
assert.equal(websiteScaffold.kind, 'website');
assert.ok(websiteScaffold.fileContents['index.html'].includes('Apresente uma barbearia'));
assert.ok(websiteScaffold.fileContents['styles.css'].includes('@media'));
assert.ok(websiteScaffold.fileContents['src/main.js'].includes('initializeSite'));
assert.ok(websiteScaffold.fileContents['tests/main.test.js']);
const websiteScaffoldDir = mkdtempSync(join(tmpdir(), 'nex-website-scaffold-'));
try {
  for (const [filePath, content] of Object.entries(websiteScaffold.fileContents)) {
    const absolutePath = join(websiteScaffoldDir, filePath);
    mkdirSync(dirname(absolutePath), {recursive: true});
    writeFileSync(absolutePath, content, 'utf8');
  }
  const websiteTestOutput = execFileSync(process.execPath, ['--test'], {
    cwd: websiteScaffoldDir,
    encoding: 'utf8'
  });
  assert.match(websiteTestOutput, /# pass 2/, 'os testes do site gerado devem passar');
} finally {
  rmSync(websiteScaffoldDir, {recursive: true, force: true});
}

const jsScaffold = codeEngine.scaffold('crie um projeto JavaScript');
assert.ok(jsScaffold.files.includes('package.json'));
assert.ok(jsScaffold.fileContents['tests/main.test.js']);
assert.equal(jsScaffold.testCommand, 'node --test');

// Executa o projeto de exemplo gerado pelo NEX em um diretório temporário.
const jsScaffoldDir = mkdtempSync(join(tmpdir(), 'nex-js-scaffold-'));
try {
  for (const [filePath, content] of Object.entries(jsScaffold.fileContents)) {
    const absolutePath = join(jsScaffoldDir, filePath);
    mkdirSync(dirname(absolutePath), {recursive: true});
    writeFileSync(absolutePath, content, 'utf8');
  }
  const jsTestOutput = execFileSync(process.execPath, ['--test'], {
    cwd: jsScaffoldDir,
    encoding: 'utf8'
  });
  assert.match(jsTestOutput, /# pass 1/, 'o teste do scaffold JavaScript deve executar e passar');
} finally {
  rmSync(jsScaffoldDir, {recursive: true, force: true});
}

const pyScaffold = codeEngine.scaffold('crie um projeto Python');
assert.ok(pyScaffold.files.includes('tests/test_main.py'));
assert.equal(pyScaffold.testCommand, 'python -m unittest discover -s tests');

// O CI Ubuntu executa também o scaffold Python completo.
const pyScaffoldDir = mkdtempSync(join(tmpdir(), 'nex-py-scaffold-'));
try {
  for (const [filePath, content] of Object.entries(pyScaffold.fileContents)) {
    const absolutePath = join(pyScaffoldDir, filePath);
    mkdirSync(dirname(absolutePath), {recursive: true});
    writeFileSync(absolutePath, content, 'utf8');
  }
  const pyTestResult = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests'], {
    cwd: pyScaffoldDir,
    encoding: 'utf8'
  });
  assert.equal(
    pyTestResult.status,
    0,
    pyTestResult.stderr || pyTestResult.stdout || 'o teste do scaffold Python deve executar e passar'
  );
  assert.match(pyTestResult.stderr + pyTestResult.stdout, /OK/);
} finally {
  rmSync(pyScaffoldDir, {recursive: true, force: true});
}

assert.equal(codeEngine.testPlan('javascript').executionSupported, false);
assert.throws(() => codeEngine.analyze('x', 'ruby'), /Linguagem não suportada/);

const core = new NexCore();
const before = JSON.stringify(core.chat.model.toJSON());
const history = core.train({epochs: 500, patience: 60});
const after = JSON.stringify(core.chat.model.toJSON());

assert.notEqual(before, after, 'pesos devem mudar');
assert.ok(history.length <= 500, 'early stopping deve ser permitido');
assert.ok(history.at(-1).validation, 'validação deve ser medida');

const beforeCalibrationEvaluation = core.evaluate();
const beforeKnownMetrics = classificationMetrics(
  beforeCalibrationEvaluation.predictions,
  core.chat.labels
);
const beforeKnownPredictions = beforeCalibrationEvaluation.predictions.filter(
  example => example.actual !== 'unknown'
);
const beforeRejection = rejectionMetrics(beforeKnownPredictions, beforeCalibrationEvaluation.unknown);

const weightsBeforeCalibration = JSON.stringify(core.chat.model.toJSON());
const calibration = core.calibrate({minKnownCoverage: 0.75});
assert.ok(calibration.metrics.knownCoverage >= 0.75, 'calibração deve respeitar cobertura mínima');
assert.ok(calibration.metrics.candidatesEvaluated > 0, 'deve avaliar combinações de limites');
assert.equal(
  JSON.stringify(core.chat.model.toJSON()),
  weightsBeforeCalibration,
  'calibrar limites não pode alterar pesos neurais'
);

const evalResult = core.evaluate();
const knownMetrics = classificationMetrics(evalResult.predictions, core.chat.labels);
const knownPredictions = evalResult.predictions.filter(example => example.actual !== 'unknown');
const rejection = rejectionMetrics(knownPredictions, evalResult.unknown);

const labels = ['video', 'code', 'memory', 'general', 'unknown'];
for (const [name, examples, expectedPerClass] of [
  ['treino', TRAIN_EXAMPLES, 12],
  ['validação', VALIDATION_EXAMPLES, 4],
  ['teste', TEST_EXAMPLES, 6]
]) {
  assert.equal(examples.length, expectedPerClass * labels.length, `tamanho do split de ${name}`);
  for (const label of labels) {
    assert.equal(
      examples.filter(example => example.label === label).length,
      expectedPerClass,
      `split de ${name} deve ser balanceado para ${label}`
    );
  }
}
assert.equal(UNKNOWN_EXAMPLES.length, 10, 'deve haver dez sondagens OOD independentes');
assert.equal(UNKNOWN_CALIBRATION_EXAMPLES.length, 8, 'deve haver oito exemplos OOD separados para calibracao');
assert.ok(Number.isFinite(knownMetrics.macro.f1));
assert.ok(rejection.unknownRejected >= 0 && rejection.unknownRejected <= 1);

const diagnosticMetrics = classificationMetrics([
  {actual: 'video', predicted: 'unknown'},
  {actual: 'code', predicted: 'code'},
  {actual: 'unknown', predicted: 'unknown'}
], labels);
assert.equal(diagnosticMetrics.confusionMatrix.video.unknown, 1);
assert.equal(diagnosticMetrics.confusionMatrix.code.code, 1);
assert.equal(diagnosticMetrics.accuracy, 2 / 3);
assert.equal(diagnosticMetrics.macro.supportedClasses, 3);

const rejectionDiagnostic = rejectionMetrics([
  {predicted: 'unknown', accepted: false},
  {predicted: 'unknown', accepted: true},
  {predicted: 'code', accepted: true}
], [
  {predicted: 'unknown', accepted: false},
  {predicted: 'unknown', accepted: true},
  {predicted: 'video', accepted: true}
]);
assert.equal(rejectionDiagnostic.knownRejected, 1 / 3, 'rejeição não deve confundir erro de classe com corte por threshold');
assert.equal(rejectionDiagnostic.unknownAccepted, 2 / 3);
assert.equal(rejectionDiagnostic.unknownRejected, 1 / 3);

const leakage = leakageReport({
  train: TRAIN_EXAMPLES,
  validation: VALIDATION_EXAMPLES,
  test: TEST_EXAMPLES,
  outOfDomain: UNKNOWN_EXAMPLES.map(text => ({label: 'unknown', text})),
  outOfDomainCalibration: UNKNOWN_CALIBRATION_EXAMPLES.map(text => ({label: 'unknown', text}))
});
assert.equal(leakage.duplicateCount, 0, 'não pode haver duplicatas entre splits');
assert.equal(leakage.similarPairCount, 0, 'não pode haver pares quase duplicados entre splits');

const unknown = core.ask('qual o melhor jeito de temperar feijao?');
assert.equal(unknown.type, 'clarification');
assert.match(unknown.text, /Pode explicar de outro jeito/);
assert.doesNotMatch(unknown.text, /Você quer conversar, guardar/);

const greeting = core.ask('oi!');
assert.equal(greeting.type, 'chat');
assert.match(greeting.text, /^Oi!/);

const smallTalk = core.ask('tudo bem?');
assert.equal(smallTalk.type, 'chat');
assert.match(smallTalk.text, /funcionando normalmente/);

const thanks = core.ask('valeu!');
assert.equal(thanks.type, 'chat');
assert.match(thanks.text, /Por nada/);

const shortReply = core.ask('sim');
assert.equal(shortReply.type, 'chat');
assert.match(shortReply.text, /Pode continuar/);

const ambiguousShortMessage = core.ask('loli');
assert.equal(ambiguousShortMessage.type, 'clarification');
assert.match(ambiguousShortMessage.text, /Não reconheci/);
assert.match(ambiguousShortMessage.text, /testando minha interpretação/);

const identity = core.ask('quem é você?');
assert.equal(identity.type, 'chat');
assert.match(identity.text, /Sou o NEX/);

const programmingTopic = core.ask('programação');
assert.equal(programmingTopic.type, 'chat');
assert.match(programmingTopic.text, /Posso ajudar com programação/);

const misspelledProgrammingTopic = core.ask('ptogamaçao');
assert.equal(misspelledProgrammingTopic.type, 'chat');
assert.match(misspelledProgrammingTopic.text, /Posso ajudar com programação/);

const capabilitiesQuestion = core.ask('oque vc pode fazer');
assert.equal(capabilitiesQuestion.type, 'chat');
assert.match(capabilitiesQuestion.text, /programação/);

const capabilitiesQuestionWithAccent = core.ask('o que você pode fazer');
assert.equal(capabilitiesQuestionWithAccent.type, 'chat');
assert.match(capabilitiesQuestionWithAccent.text, /programação/);

const programmingRequest = core.ask('quero programar um aplicativo em JavaScript');
assert.equal(programmingRequest.type, 'code');
assert.equal(programmingRequest.result.type, 'scaffold');

const capabilities = core.ask('explique tudo oq pode fazer');
assert.equal(capabilities.type, 'chat');
assert.match(capabilities.text, /programação/);
assert.match(capabilities.text, /memórias/);

const imageCapability = core.ask('consegue criar imagens?');
assert.equal(imageCapability.type, 'chat');
assert.match(imageCapability.text, /Ainda não/);
assert.match(imageCapability.text, /motor de geração de imagens integrado/);
const appRequest = core.ask('quero criar um aplicativo');
assert.equal(appRequest.type, 'code');
assert.equal(appRequest.result.type, 'scaffold');

const pythonRequest = core.ask('me ajuda com Python');
assert.equal(pythonRequest.type, 'code');
assert.equal(pythonRequest.result.language, 'python');


const cinematicPlan = core.video.plan('crie uma nave e um robô voando em uma cidade à noite com camera pan por 12 segundos');
assert.equal(cinematicPlan.schema, 'nex.video-plan.v2');
assert.equal(cinematicPlan.durationSeconds, 12);
assert.equal(cinematicPlan.scene.environment, 'night');
assert.equal(cinematicPlan.camera.motion, 'pan');
assert.deepEqual(cinematicPlan.scene.objects.map(object => object.type), ['spaceship', 'robot', 'city']);
assert.equal(cinematicPlan.capabilities.videoGeneration, false, 'planejamento não deve se apresentar como vídeo renderizado');

const video = core.ask('crie uma cena 3d com uma nave');
assert.equal(video.type, 'video-plan', 'um comando de vídeo claro deve gerar um plano de vídeo');

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

const integratedSite = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(integratedSite.includes("import { NexCore } from './src/index.js'"), 'site importa o Core');
assert.ok(integratedSite.includes('window.nexCore = core'), 'site expõe a instância do Core');
assert.ok(integratedSite.includes('window.nexReady'), 'site aguarda a inicialização');
assert.ok(integratedSite.includes('NEX CORE 0.4.0'), 'site identifica a versão integrada');
assert.ok(integratedSite.includes('id="nex-core-status"'), 'site exibe estado do Core');


const voiceControlStart = integratedSite.indexOf('function voiceErrorMessage(');
const voiceControlEnd = integratedSite.indexOf('\nfunction toggleVoiceOutput()', voiceControlStart);
assert.ok(voiceControlStart >= 0 && voiceControlEnd > voiceControlStart, 'o site deve conter os controles de reconhecimento de voz');
const voiceControlSource = integratedSite.slice(voiceControlStart, voiceControlEnd);
const voiceButtonClasses = new Set();
const voiceInput = {value: '', style: {}, scrollHeight: 58};
const voiceToasts = [];
const speechInstances = [];
let fakeStartError = null;
class FakeSpeechRecognition {
  constructor() { speechInstances.push(this); }
  start() {
    if (fakeStartError) throw fakeStartError;
    this.started = true;
    this.onstart?.();
  }
  stop() { this.stopped = true; }
}
const voiceSandbox = {
  window: {SpeechRecognition: FakeSpeechRecognition},
  speechRecognition: null,
  speechRecognitionStopRequested: false,
  $: id => id === 'msg' ? voiceInput : ({
    classList: {
      add: name => voiceButtonClasses.add(name),
      remove: name => voiceButtonClasses.delete(name)
    }
  }),
  toast: message => voiceToasts.push(String(message))
};
runInNewContext(
  voiceControlSource + '\nglobalThis.testToggleVoiceInput=toggleVoiceInput;globalThis.testVoiceErrorMessage=voiceErrorMessage;',
  voiceSandbox
);

voiceInput.value = 'texto anterior';
voiceSandbox.testToggleVoiceInput();
const successfulRecognition = speechInstances.at(-1);
assert.equal(successfulRecognition.started, true, 'deve iniciar o reconhecimento');
assert.ok(voiceButtonClasses.has('listening'), 'deve indicar visualmente que está ouvindo');
successfulRecognition.onresult({
  results: [[{transcript: 'olá'}], [{transcript: 'mundo'}]]
});
assert.equal(voiceInput.value, 'texto anterior olá mundo', 'deve preservar o texto anterior e juntar todos os resultados');
assert.equal(voiceInput.style.height, '58px', 'deve redimensionar o campo com o texto reconhecido');
successfulRecognition.onend();
assert.equal(voiceSandbox.speechRecognition, null, 'deve limpar a sessão ao terminar');
assert.ok(!voiceButtonClasses.has('listening'), 'deve remover o estado visual ao terminar');

voiceInput.value = '';
voiceSandbox.testToggleVoiceInput();
const noSpeechRecognition = speechInstances.at(-1);
noSpeechRecognition.onerror({error: 'no-speech'});
assert.match(voiceToasts.at(-1), /Não detectei fala/, 'no-speech deve explicar que nenhuma fala foi detectada, sem culpar o microfone');
noSpeechRecognition.onend();
assert.equal(voiceToasts.filter(message => /Não detectei fala/.test(message)).length, 1, 'não deve mostrar erros duplicados ao encerrar');

voiceSandbox.testToggleVoiceInput();
const manuallyStoppedRecognition = speechInstances.at(-1);
voiceSandbox.testToggleVoiceInput();
assert.equal(manuallyStoppedRecognition.stopped, true, 'o segundo clique deve parar a sessão ativa');
manuallyStoppedRecognition.onend();
assert.equal(voiceSandbox.speechRecognition, null, 'o encerramento manual deve limpar a sessão');

voiceSandbox.window.SpeechRecognition = undefined;
voiceSandbox.window.webkitSpeechRecognition = undefined;
voiceSandbox.testToggleVoiceInput();
assert.match(voiceToasts.at(-1), /não oferece reconhecimento/, 'deve avisar quando a API não existe');

assert.match(voiceSandbox.testVoiceErrorMessage('not-allowed'), /permissão/, 'deve explicar bloqueio de permissão');
assert.match(voiceSandbox.testVoiceErrorMessage('network'), /internet/, 'deve explicar falha de rede');

voiceSandbox.window.SpeechRecognition = FakeSpeechRecognition;
fakeStartError = new Error('start bloqueado');
voiceSandbox.testToggleVoiceInput();
assert.equal(voiceSandbox.speechRecognition, null, 'uma falha síncrona ao iniciar não pode deixar a sessão presa');
assert.ok(!voiceButtonClasses.has('listening'), 'uma falha ao iniciar deve limpar o estado visual');
fakeStartError = null;

const inlineScripts = [...integratedSite.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
assert.ok(inlineScripts.length >= 2, 'site deve conter scripts inline');
const inlineCheckDir = mkdtempSync(join(tmpdir(), 'nex-inline-script-check-'));
try {
  inlineScripts.forEach((match, index) => {
    const isModule = /\btype=["']module["']/i.test(match[1]);
    const extension = isModule ? 'mjs' : 'js';
    const filePath = join(inlineCheckDir, 'inline-' + index + '.' + extension);
    writeFileSync(filePath, match[2], 'utf8');
    const syntax = spawnSync(process.execPath, ['--check', filePath], {encoding: 'utf8'});
    assert.equal(
      syntax.status,
      0,
      'script inline ' + index + ' deve ter sintaxe válida: ' + (syntax.stderr || syntax.stdout)
    );
  });
} finally {
  rmSync(inlineCheckDir, {recursive: true, force: true});
}

console.log(JSON.stringify({
  ok: true,
  datasetVersion: core.chat.datasetVersion,
  counts: {
    train: TRAIN_EXAMPLES.length,
    validation: VALIDATION_EXAMPLES.length,
    test: TEST_EXAMPLES.length,
    outOfDomain: UNKNOWN_EXAMPLES.length,
    outOfDomainCalibration: UNKNOWN_CALIBRATION_EXAMPLES.length
  },
  epochs: history.length,
  initialLoss: history[0].loss,
  finalTrainLoss: history.at(-1).loss,
  finalValidationLoss: history.at(-1).validation?.loss,
  beforeCalibration: {
    testAccuracy: beforeKnownMetrics.accuracy,
    macroF1: beforeKnownMetrics.macro.f1,
    knownRejected: beforeRejection.knownRejected,
    outOfDomainRejected: beforeRejection.unknownRejected
  },
  afterCalibration: {
    testAccuracy: knownMetrics.accuracy,
    macroF1: knownMetrics.macro.f1,
    knownRejected: rejection.knownRejected,
    outOfDomainRejected: rejection.unknownRejected
  },
  testAccuracy: knownMetrics.accuracy,
  macroF1: knownMetrics.macro.f1,
  perClass: knownMetrics.perClass,
  confusionMatrix: knownMetrics.confusionMatrix,
  knownRejected: rejection.knownRejected,
  outOfDomainRejected: rejection.unknownRejected,
  calibration,
  leakage,
  evaluationTests: [
    'balanced train, validation and test splits',
    'unknown predictions included in confusion matrix',
    'macro averages calculated over supported classes',
    'independent out-of-domain examples',
    'explicit video command routed to video-plan',
    'rejection thresholds calibrated on validation plus separate OOD set',
    'calibration leaves neural weights unchanged'
  ],
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
