import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {NexCore, TinyMLP, NexMemory, TextVectorizer} from '../src/index.js';
import {LOCAL_MODEL, LOCAL_MODEL_OPTIONS, loadLocalLLM, generateLocalReply, isDegenerateAnswer} from '../src/local-llm.js';
import {NexCodeEngine} from '../src/engines/code-engine.js';
import {buildProjectPreview} from '../src/engines/project-preview.js';
import {classificationMetrics, rejectionMetrics} from '../src/evaluation/metrics.js';
import {leakageReport} from '../src/evaluation/leakage.js';
import {TRAIN_EXAMPLES, VALIDATION_EXAMPLES, TEST_EXAMPLES, UNKNOWN_EXAMPLES, UNKNOWN_CALIBRATION_EXAMPLES} from '../data/training-data.js';
import {isSupportedPageUrl} from '../extension/sala-do-futuro/policy.js';
import {NEX_APP_ORIGIN, isNexAppOrigin, isSafeHttpsUrl, isSafePairingCode, validateBrowserCommand} from '../extension/sala-do-futuro/protocol.js';
import {clickElementOnPage, fillFieldOnPage, hoverElementOnPage, selectOptionOnPage} from '../extension/sala-do-futuro/page-actions.js';
import {parseNexBrowserCommand, parseNexBrowserPlan} from '../src/browser/command-parser.js';
import {parseNexCodingCommand} from '../src/agent/coding-command-parser.js';


assert.equal(isSupportedPageUrl('https://saladofuturo.educacao.sp.gov.br/'), true);
assert.equal(isSupportedPageUrl('https://SALADOFUTURO.EDUCACAO.SP.GOV.BR/atividade'), true);
assert.equal(isSupportedPageUrl('http://saladofuturo.educacao.sp.gov.br/'), false);
assert.equal(isSupportedPageUrl('https://saladofuturo.educacao.sp.gov.br.evil.example/'), true);
assert.equal(isSupportedPageUrl('https://example.com/'), true);
assert.equal(isSupportedPageUrl('https://usuario:senha@saladofuturo.educacao.sp.gov.br/'), false);

assert.equal(NEX_APP_ORIGIN,'https://nex-ai-preview-git-feat-nex-browser-agent-araujxs22-8685.vercel.app');
assert.equal(isNexAppOrigin('https://nex-ai-preview-git-feat-nex-browser-agent-araujxs22-8685.vercel.app/'),true);
assert.equal(isNexAppOrigin('https://nex-ai-preview-git-feat-nex-browser-agent-araujxs22-8685.vercel.app.evil.example/'),false);
assert.equal(isNexAppOrigin('http://nex-ai-preview.vercel.app/'),false);
assert.equal(isSafeHttpsUrl('https://example.com/path'),true);
assert.equal(isSafeHttpsUrl('http://example.com/'),false);
assert.equal(isSafeHttpsUrl('javascript:alert(1)'),false);
assert.equal(isSafeHttpsUrl('https://user:pass@example.com/'),false);
assert.equal(isSafePairingCode('0123456789abcdef0123456789abcdef'),true);
assert.equal(isSafePairingCode('short-code'),false);
assert.deepEqual(validateBrowserCommand({type:'READ_PAGE'}),{ok:true,command:{type:'READ_PAGE'}});
assert.deepEqual(validateBrowserCommand({type:'HOVER',target:'Tarefa 5'}),{ok:true,command:{type:'HOVER',target:'Tarefa 5'}});
assert.equal(validateBrowserCommand({type:'HOVER',target:''}).ok,false);
assert.deepEqual(validateBrowserCommand({type:'SELECT_OPTION',option:'Certo',question:'questão 2'}),{ok:true,command:{type:'SELECT_OPTION',option:'Certo',question:'questão 2'}});
assert.equal(validateBrowserCommand({type:'SELECT_OPTION',option:''}).ok,false);
assert.equal(validateBrowserCommand({type:'NAVIGATE',url:'http://example.com'}).ok,false);
assert.equal(validateBrowserCommand({type:'NAVIGATE',url:'https://user:pass@example.com'}).ok,false);
assert.equal(validateBrowserCommand({type:'FILL_FIELD',field:'senha',value:'x'}).ok,false);
assert.equal(validateBrowserCommand({type:'FILL_FIELD',field:'Nome',value:'Kaue'}).ok,true);
assert.equal(validateBrowserCommand({type:'RUN_SCRIPT',code:'alert(1)'}).ok,false);

assert.deepEqual(parseNexBrowserCommand('ler página'), {type:'READ_PAGE'});
assert.deepEqual(parseNexBrowserCommand('LEIA A PÁGINA'), {type:'READ_PAGE'});
assert.deepEqual(
  parseNexBrowserCommand('Use a extensão do navegador para ler o conteúdo visível da aba atual. Retorne todo o texto da página, sem tentar clicar, preencher ou enviar nada.'),
  {type:'READ_PAGE'}
);
assert.deepEqual(parseNexBrowserCommand('NEX abrir https://example.com'), {type:'NAVIGATE',url:'https://example.com'});
assert.deepEqual(parseNexBrowserCommand('clique em prosseguir para tarefa'), {type:'CLICK',target:'prosseguir para tarefa'});
assert.deepEqual(parseNexBrowserCommand('clique no cartão da Tarefa 5'), {type:'CLICK',target:'cartão da Tarefa 5'});
assert.deepEqual(parseNexBrowserCommand('passe o mouse sobre Tarefa 5'), {type:'HOVER',target:'Tarefa 5'});
assert.deepEqual(parseNexBrowserCommand('passar mouse em Religião e poder na Idade Média'), {type:'HOVER',target:'Religião e poder na Idade Média'});
assert.deepEqual(
  parseNexBrowserCommand('Passe o mouse sobre o elemento que contém o texto "Tarefa 5". Procure na página inteira, inclusive dentro de cartões e elementos filhos. Role até ele se necessário. Não clique.'),
  {type:'HOVER',target:'Tarefa 5'}
);
assert.deepEqual(parseNexBrowserCommand('marque Certo na questão 2'),{type:'SELECT_OPTION',option:'Certo',question:'questão 2'});
assert.deepEqual(parseNexBrowserCommand('selecione A na questão 3'),{type:'SELECT_OPTION',option:'A',question:'questão 3'});
assert.equal(parseNexBrowserCommand('Leia a página, pesquise o conteúdo e marque as respostas corretas.'),null,
  'um pedido composto não deve ser interpretado como um simples comando de leitura');
assert.equal(parseNexBrowserCommand('leia a página e clique em Enviar'), null,
  'uma solicitação que mistura leitura com ações deve exigir um comando explícito separado');



function mockBrowserElement({
  tagName='INPUT', type='text', name='', id='', placeholder='', ariaLabel='',
  autocomplete='', value='', text='', href='', labels=[], options=[], editable=false, cursor='default'
}={}) {
  let currentValue = value;
  const events = [];
  return {
    tagName, type, name, id, placeholder, autocomplete, labels, options, cursor,
    innerText:text, textContent:text, disabled:false, readOnly:false,
    isContentEditable:editable, events, clickCount:0,
    get value() { return currentValue; },
    set value(next) { currentValue = String(next); },
    getAttribute(attribute) {
      if (attribute === 'aria-label') return ariaLabel;
      if (attribute === 'autocomplete') return autocomplete;
      if (attribute === 'href') return href;
      if (attribute === 'contenteditable') return editable ? 'true' : null;
      if (attribute === 'aria-disabled') return null;
      return null;
    },
    getBoundingClientRect() { return {width:120,height:24,left:30,top:40,right:150,bottom:64}; },
    scrollIntoView(options) { this.scrolledWith=options; },
    focus() { this.focused = true; },
    dispatchEvent(event) { events.push(event.type); return true; },
    click() { this.clickCount += 1; }
  };
}
const originalDocumentForBrowserTests = globalThis.document;
const originalGetComputedStyleForBrowserTests = globalThis.getComputedStyle;
let browserTestElements = [];
globalThis.document = {querySelectorAll: () => browserTestElements};
globalThis.getComputedStyle = element => ({cursor: element.cursor || 'default'});
try {
  const hoverCard = mockBrowserElement({tagName:'DIV',text:'Tarefa 5: Religião e poder na Idade Média',cursor:'pointer'});
  browserTestElements = [hoverCard];
  const hoverResult = await hoverElementOnPage('Tarefa 5: Religião e poder na Idade Média');
  assert.equal(hoverResult.ok, true, 'deve localizar cartão para hover');
  assert.deepEqual(hoverCard.scrolledWith,{behavior:'auto',block:'center',inline:'nearest'});
  assert.ok(hoverCard.events.includes('pointerover') && hoverCard.events.includes('mouseover'),
    'deve enviar eventos pointer e mouse para handlers da página');
  assert.match(hoverResult.note,/CSS :hover/);

  const plainCard = mockBrowserElement({tagName:'DIV',text:'Tarefa 6: A crise do sistema feudal',cursor:'default'});
  browserTestElements = [plainCard];
  const plainHoverResult = await hoverElementOnPage('Tarefa 6');
  assert.equal(plainHoverResult.ok,true,'deve localizar elementos de texto sem role ou cursor pointer');
  assert.ok(plainCard.events.includes('mouseover'));

  const taskCard = mockBrowserElement({tagName:'DIV',text:'Tarefa 5: Religião e poder na Idade Média',cursor:'pointer'});
  browserTestElements = [taskCard];
  const taskCardResult = clickElementOnPage('Tarefa 5: Religião e poder na Idade Média');
  assert.equal(taskCardResult.ok, true, 'deve reconhecer e clicar em cartão de tarefa com cursor clicável');
  assert.equal(taskCard.clickCount, 1);

  const cardContainer = mockBrowserElement({tagName:'DIV',text:'Tarefa 5: Religião e poder na Idade Média',cursor:'pointer'});
  const cardTitle = mockBrowserElement({tagName:'DIV',text:'Tarefa 5: Religião e poder na Idade Média',cursor:'pointer'});
  cardContainer.contains = element => element === cardTitle;
  browserTestElements = [cardContainer,cardTitle];
  const nestedCardResult = clickElementOnPage('Tarefa 5: Religião e poder na Idade Média');
  assert.equal(nestedCardResult.ok, true, 'deve escolher o título dentro do cartão sem confundir o contêiner');
  assert.equal(cardTitle.clickCount, 1);
  assert.equal(cardContainer.clickCount, 0);

  const searchInput = mockBrowserElement({name:'q',placeholder:'Pesquisar'});
  browserTestElements = [searchInput];
  const fillResult = fillFieldOnPage('Pesquisar', 'melhores jogos leves');
  assert.equal(fillResult.ok, true, 'deve preencher um campo de texto visível');
  assert.equal(searchInput.value, 'melhores jogos leves');
  assert.ok(searchInput.events.includes('input') && searchInput.events.includes('change'), 'deve notificar eventos de entrada e alteração');

  const select = mockBrowserElement({
    tagName:'SELECT', type:'select-one', name:'category',
    options:[
      {label:'Tecnologia',textContent:'Tecnologia',value:'tech',disabled:false},
      {label:'Esportes',textContent:'Esportes',value:'sports',disabled:false}
    ]
  });
  browserTestElements = [select];
  const selectResult = fillFieldOnPage('category', 'Esportes');
  assert.equal(selectResult.ok, true, 'deve selecionar uma opção de lista suspensa');
  assert.equal(select.value, 'sports');
  assert.ok(select.events.includes('change'));

  const correctChoice = mockBrowserElement({
    tagName:'INPUT',type:'radio',name:'question2',
    labels:[{innerText:'Certo',textContent:'Certo'}]
  });
  correctChoice.checked=false;
  correctChoice.click=function(){this.checked=true;this.clickCount+=1;};
  browserTestElements=[correctChoice];
  const choiceResult=selectOptionOnPage('Certo');
  assert.equal(choiceResult.ok,true,'deve selecionar uma opção radio pelo rótulo');
  assert.equal(correctChoice.checked,true,'deve confirmar o estado selecionado');
  assert.equal(correctChoice.clickCount,1);

  const externalLabel={innerText:'Errado',textContent:'Errado',getBoundingClientRect:()=>({width:120,height:24,left:30,top:40,right:150,bottom:64})};
  const visuallyHiddenChoice=mockBrowserElement({tagName:'INPUT',type:'radio',labels:[externalLabel]});
  visuallyHiddenChoice.checked=false;
  visuallyHiddenChoice.getBoundingClientRect=()=>({width:0,height:0,left:0,top:0,right:0,bottom:0});
  visuallyHiddenChoice.click=function(){this.checked=true;this.clickCount+=1;};
  browserTestElements=[visuallyHiddenChoice];
  const hiddenChoiceResult=selectOptionOnPage('Errado');
  assert.equal(hiddenChoiceResult.ok,true,'deve selecionar input oculto associado a label externa visível');
  assert.equal(visuallyHiddenChoice.checked,true);

  const duplicateChoiceA = mockBrowserElement({tagName:'INPUT',type:'radio',labels:[{innerText:'Certo',textContent:'Certo'}]});
  const duplicateChoiceB = mockBrowserElement({tagName:'INPUT',type:'radio',labels:[{innerText:'Certo',textContent:'Certo'}]});
  duplicateChoiceA.checked=false; duplicateChoiceB.checked=false;
  browserTestElements=[duplicateChoiceA,duplicateChoiceB];
  const ambiguousChoice=selectOptionOnPage('Certo');
  assert.equal(ambiguousChoice.ok,false,'deve recusar opções duplicadas sem escopo');
  assert.equal(duplicateChoiceA.clickCount+duplicateChoiceB.clickCount,0,'não deve escolher entre alternativas ambíguas');

  const password = mockBrowserElement({type:'password',name:'password',placeholder:'Senha'});
  const oneTimeCode = mockBrowserElement({type:'text',name:'otp',placeholder:'Código',autocomplete:'one-time-code'});
  browserTestElements = [password, oneTimeCode];
  assert.equal(fillFieldOnPage('Senha', '123456').ok, false, 'não deve preencher campos de senha');
  assert.equal(fillFieldOnPage('Código', '123456').ok, false, 'não deve preencher campos de código de verificação');

  const firstName = mockBrowserElement({name:'first',placeholder:'Nome'});
  const secondName = mockBrowserElement({name:'last',placeholder:'Nome'});
  browserTestElements = [firstName, secondName];
  assert.equal(fillFieldOnPage('Nome', 'Kaue').ok, false, 'deve evitar escolher um campo ambíguo');

  const submitButton = mockBrowserElement({tagName:'BUTTON',type:'submit',text:'Enviar'});
  const safeLink = mockBrowserElement({tagName:'A',text:'Abrir documentação',href:'/docs'});
  browserTestElements = [submitButton, safeLink];
  const clickResult = clickElementOnPage('Abrir documentação');
  assert.equal(clickResult.ok, true, 'deve clicar em um link visível com correspondência exata');
  assert.equal(safeLink.clickCount, 1);
  assert.equal(submitButton.clickCount, 0, 'nunca deve acionar botões de envio');
  const purchaseButton = mockBrowserElement({tagName:'BUTTON',type:'button',text:'Comprar agora'});
  browserTestElements = [purchaseButton];
  assert.equal(clickElementOnPage('Comprar agora').ok, false, 'deve bloquear ações de compra');
  assert.equal(purchaseButton.clickCount, 0, 'não deve acionar o botão de compra');

  const namedPassword = mockBrowserElement({type:'text',name:'user_password',placeholder:'Senha'});
  browserTestElements = [namedPassword];
  assert.equal(fillFieldOnPage('Senha', 'abc123').ok, false, 'deve bloquear campos sensíveis mesmo quando não são input[type=password]');


  browserTestElements = [safeLink, mockBrowserElement({tagName:'A',text:'Abrir documentação avançada',href:'/advanced'})];
  assert.equal(clickElementOnPage('Abrir').ok, false, 'deve pedir texto específico quando a busca parcial é ambígua');
} finally {
  if (originalDocumentForBrowserTests === undefined) delete globalThis.document;
  else globalThis.document = originalDocumentForBrowserTests;
  if (originalGetComputedStyleForBrowserTests === undefined) delete globalThis.getComputedStyle;
  else globalThis.getComputedStyle = originalGetComputedStyleForBrowserTests;
}

const salaExtensionManifest = JSON.parse(readFileSync(new URL('../extension/sala-do-futuro/manifest.json', import.meta.url), 'utf8'));
assert.equal(salaExtensionManifest.manifest_version, 3);
assert.equal(salaExtensionManifest.version, '1.5.0');
assert.ok(salaExtensionManifest.host_permissions.includes('http://127.0.0.1:4177/*'));
assert.deepEqual(salaExtensionManifest.permissions, ['activeTab', 'scripting', 'storage', 'clipboardWrite']);
assert.equal(salaExtensionManifest.background.service_worker, 'background.js');
assert.equal(salaExtensionManifest.background.type, 'module');
assert.equal(salaExtensionManifest.content_scripts[0].matches[0], 'https://nex-ai-preview-git-feat-nex-browser-agent-araujxs22-8685.vercel.app/*');
assert.equal(salaExtensionManifest.host_permissions, undefined);
const browserBackgroundSource = readFileSync(new URL('../extension/sala-do-futuro/background.js', import.meta.url), 'utf8');
assert.match(browserBackgroundSource, /case 'COMMAND': return queueCommand\(message\.payload\);/,
  'o bridge deve encaminhar o envelope do comando sem embrulhá-lo duas vezes');
assert.doesNotMatch(browserBackgroundSource, /case 'COMMAND': return \{ok:true,data:await queueCommand/,
  'o bridge não deve criar uma resposta aninhada');


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


const barberScaffold = codeEngine.scaffold('crie um site responsivo para uma barbearia');
assert.equal(barberScaffold.kind, 'website');
assert.equal(barberScaffold.businessType, 'barbershop');
assert.ok(barberScaffold.fileContents['index.html'].includes('CORTE'));
assert.ok(barberScaffold.fileContents['index.html'].includes('Corte masculino'));
assert.ok(barberScaffold.fileContents['index.html'].includes('R$ 45'));
assert.ok(barberScaffold.fileContents['index.html'].includes('booking-form'));
assert.ok(barberScaffold.fileContents['styles.css'].includes('@media'));
assert.ok(barberScaffold.fileContents['src/main.js'].includes('initializeSite'));
assert.doesNotMatch(barberScaffold.fileContents['index.html'], /Apresente uma barbearia|Uma presença digital bem construída/);

const barberScaffoldDir = mkdtempSync(join(tmpdir(), 'nex-barbershop-scaffold-'));
try {
  for (const [filePath, content] of Object.entries(barberScaffold.fileContents)) {
    const absolutePath = join(barberScaffoldDir, filePath);
    mkdirSync(dirname(absolutePath), {recursive: true});
    writeFileSync(absolutePath, content, 'utf8');
  }
  const barberTestOutput = execFileSync(process.execPath, ['--test'], {
    cwd: barberScaffoldDir,
    encoding: 'utf8'
  });
  assert.match(barberTestOutput, /pass\s+2/, 'os testes do site de barbearia devem passar');
} finally {
  rmSync(barberScaffoldDir, {recursive: true, force: true});
}

const gameScaffold = codeEngine.scaffold('Faça um jogo simples de adivinhação em JavaScript');
assert.equal(gameScaffold.kind, 'game');
assert.equal(gameScaffold.gameType, 'number-guessing');
assert.ok(gameScaffold.fileContents['index.html'].includes('guess-form'));
assert.ok(gameScaffold.fileContents['src/main.js'].includes('submitGuess'));
const gameScaffoldDir = mkdtempSync(join(tmpdir(), 'nex-guessing-game-'));
try {
  for (const [filePath, content] of Object.entries(gameScaffold.fileContents)) {
    const absolutePath = join(gameScaffoldDir, filePath);
    mkdirSync(dirname(absolutePath), {recursive: true});
    writeFileSync(absolutePath, content, 'utf8');
  }
  const gameTestOutput = execFileSync(process.execPath, ['--test'], {
    cwd: gameScaffoldDir,
    encoding: 'utf8'
  });
  assert.match(gameTestOutput, /pass\s+6/, 'os testes do jogo de adivinhação devem passar');
} finally {
  rmSync(gameScaffoldDir, {recursive: true, force: true});
}

const previewHtml = buildProjectPreview(barberScaffold.fileContents);
assert.match(previewHtml, /Content-Security-Policy/, 'a prévia deve aplicar CSP');
assert.match(previewHtml, /connect-src 'none'/, 'a prévia deve bloquear conexões externas');
assert.match(previewHtml, /<style>/, 'a prévia deve incorporar o CSS');
assert.match(previewHtml, /Corte Nobre/, 'a prévia deve manter o conteúdo do site');
assert.match(previewHtml, /initializeSite\(document\)/, 'a prévia deve incorporar o JavaScript do site');
assert.doesNotMatch(previewHtml, /src="\.\/styles\.css"/, 'a prévia não deve depender do arquivo CSS externo');
assert.doesNotMatch(previewHtml, /src="\.\/src\/main\.js"/, 'a prévia não deve depender do arquivo JavaScript externo');
assert.throws(() => buildProjectPreview({}), /index\.html/, 'deve rejeitar projeto sem página HTML');
assert.throws(() => buildProjectPreview({'index.html':'<html></html>','src/main.js':'import module from "https://example.com/module.js";'}), /imports externos/, 'deve recusar imports externos na prévia isolada');

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
  assert.match(jsTestOutput, /pass\s+1/, 'o teste do scaffold JavaScript deve executar e passar');
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

assert.equal(LOCAL_MODEL.id, 'onnx-community/SmolLM2-135M-Instruct-ONNX');
assert.equal(LOCAL_MODEL.dtype, 'q4');
assert.equal(LOCAL_MODEL.device, 'WASM CPU');
assert.equal(LOCAL_MODEL_OPTIONS.length, 2);
assert.equal(LOCAL_MODEL_OPTIONS[1].id, 'onnx-community/Qwen3-0.6B-ONNX');
assert.equal(typeof loadLocalLLM, 'function');
assert.equal(typeof generateLocalReply, 'function');

const vectorizerFixture = TextVectorizer.fromExamples([
  {label:'code',text:'criar site'},
  {label:'code',text:'criar aplicação'},
  {label:'video',text:'renderizar cena'}
]).vectorizer;
assert.ok(vectorizerFixture.vocab.some(feature => feature === 'b:criar_site'),
  'o vetorizador deve preservar pares de palavras');
assert.ok(vectorizerFixture.idf.every(value => Number.isFinite(value) && value > 0),
  'IDF deve conter pesos finitos e positivos');
const phraseVector = vectorizerFixture.encode('criar site');
assert.ok(Math.abs(Math.sqrt(phraseVector.reduce((sum,value)=>sum+value*value,0))-1)<1e-9,
  'features devem ser normalizadas por norma L2');
assert.equal(vectorizerFixture.recognizedRatio('criar site'),1);

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

const salaDoFuturoPage = `
Sala do Futuro Aluno
https://saladofuturo.educacao.sp.gov.br/atividade/106679830?enable_captcha=true
Tarefa SP
História - 2200
Tarefa 5: Religião e poder na Idade Média
Aprendizagem Essencial: Associar as características e trajetórias dos povos cristãos, judeus e islâmicos.
Questão 01 de 06
Preencha as lacunas a seguir sobre judaísmo.
Questão 02 de 06
A) Os judeus foram proibidos de exercer cargos públicos.
Certo
Errado
Questão 03 de 06
A Primeira Cruzada foi organizada por quais povos?
A) judeus.
B) cristãos.
C) islâmicos.
D) muçulmanos.
Questão 04 de 06
A relação entre cristãos portugueses e judeus foi marcada por...
A) conflitos.
B) perseguições e trocas culturais.
C) harmonia.
D) paz.
Questão 05 de 06
Uma consequência das Cruzadas foi o...
A) conflito entre reinos.
B) contato entre regiões distintas.
C) isolamento religioso.
D) enfraquecimento comercial.
Questão 06 de 06
Explique como as Cruzadas levaram a transformações políticas na Europa feudal.
N° mínimo de caracteres: 1
`;
const schoolTaskResponse = core.ask(salaDoFuturoPage);
assert.equal(schoolTaskResponse.type, 'school-task', 'texto da Sala do Futuro deve ser reconhecido como atividade');
assert.equal(schoolTaskResponse.result.total, 6, 'total de questões deve ser identificado');
assert.equal(schoolTaskResponse.result.detected, 6, 'questões visíveis devem ser contadas');
assert.equal(schoolTaskResponse.result.subject, 'História', 'matéria deve ser extraída');
assert.match(schoolTaskResponse.text, /Tarefa 5: Religião e poder na Idade Média/);
assert.match(schoolTaskResponse.text, /6 de 6/);
assert.equal(schoolTaskResponse.result.questions[0].type, 'fill-blanks');
assert.equal(schoolTaskResponse.result.questions[1].type, 'true-false');
assert.equal(schoolTaskResponse.result.questions[2].type, 'multiple-choice');
assert.equal(schoolTaskResponse.result.questions[5].type, 'written-response');
const schoolQuestionResponse = core.ask('me ajuda na questão 1');
assert.equal(schoolQuestionResponse.type, 'school-question', 'NEX deve preservar o contexto da atividade');
assert.match(schoolQuestionResponse.text, /Completar lacunas/);
assert.match(schoolQuestionResponse.text, /judaísmo|lacunas/i);
const schoolWrittenResponse = core.ask('explique a questão 6');
assert.equal(schoolWrittenResponse.type, 'school-question');
assert.match(schoolWrittenResponse.text, /apresente a mudança/);
const missingSchoolQuestion = core.ask('questão 9');
assert.equal(missingSchoolQuestion.type, 'school-question');
assert.match(missingSchoolQuestion.text, /Não encontrei a questão 9/);

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

const negatedForestPlan = core.video.plan('Quero uma árvore, mas não quero uma floresta');
assert.deepEqual(negatedForestPlan.scene.objects.map(object => object.type), ['tree'], 'uma floresta negada não deve entrar na cena');
const exactWordPlan = core.video.plan('Crie uma cena de casamento com uma árvore');
assert.deepEqual(exactWordPlan.scene.objects.map(object => object.type), ['tree'], 'casamento não deve ser confundido com casa');
const explicitHousePlan = core.video.plan('Crie uma casa com uma árvore');
assert.deepEqual(explicitHousePlan.scene.objects.map(object => object.type), ['house','tree'], 'a ordem dos objetos deve seguir a ordem do pedido');

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
assert.ok(integratedSite.includes('NEX CORE 0.6.0'), 'site identifica a versão integrada');
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


const browserPlanFixture=parseNexBrowserPlan('ler página; clicar em Pesquisar; preencher campo Nome com Kaue');
assert.equal(browserPlanFixture.length,3,'o planejador deve dividir comandos explícitos em etapas');
assert.equal(browserPlanFixture[0].type,'READ_PAGE');
assert.equal(browserPlanFixture[1].type,'CLICK');
assert.equal(browserPlanFixture[2].type,'FILL_FIELD');
assert.equal(parseNexBrowserPlan('ler página; texto sem comando'),null,'planos incompletos devem ser rejeitados');
assert.deepEqual(parseNexCodingCommand('listar arquivos'),{type:'list',path:'.'});
assert.deepEqual(parseNexCodingCommand('ler arquivo src/app.js'),{type:'read',path:'src/app.js'});
assert.deepEqual(parseNexCodingCommand('executar npm test'),{type:'run',command:'npm test'});
assert.equal(parseNexCodingCommand('criar arquivo notas.txt com conteúdo: olá').content,'olá');
assert.equal(parseNexCodingCommand('executar rm -rf .'),null,'comandos fora da lista permitida devem ser rejeitados');
assert.equal(isDegenerateAnswer('a sua formina, a sua formina, a sua formina, a sua formina, a sua formina'),false,'respostas curtas não devem ser bloqueadas');
assert.equal(isDegenerateAnswer('a sua formina a sua formina a sua formina a sua formina a sua formina a sua formina a sua formina'),true,'loops de palavras devem ser rejeitados');
const localAgentSource=readFileSync(new URL('../local-agent/server.mjs',import.meta.url),'utf8');
assert.ok(localAgentSource.includes("const HOST = '127.0.0.1'"),'o agente local deve escutar apenas no loopback');
assert.ok(localAgentSource.includes("timingSafeEqual"),'o agente local deve comparar tokens em tempo constante');
assert.ok(localAgentSource.includes("'/api/commands/run'"),'o agente local deve oferecer execução controlada de comandos');
assert.ok(localAgentSource.includes('Use caminhos relativos dentro da pasta de trabalho.'),'o agente local deve restringir caminhos ao workspace');
assert.ok(integratedSite.includes('id="nex-activity"'),'a interface deve ter o indicador compacto de atividade');
assert.ok(integratedSite.includes('Navegador · etapa'),'planos devem exibir a etapa ativa');
assert.ok(integratedSite.includes('nex-local-agent-connect'),'o site deve expor conexão ao agente local');
