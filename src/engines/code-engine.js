const OPEN_TO_CLOSE = {'(': ')', '[': ']', '{': '}'};
const CLOSERS = new Set(Object.values(OPEN_TO_CLOSE));
const HTML_VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function positionAt(source, index) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === '\n') { line++; column = 1; }
    else column++;
  }
  return {line, column};
}

function makeDiagnostic(source, index, severity, code, message, suggestion = '') {
  const position = positionAt(source, index);
  return {
    severity, code, message,
    line: position.line,
    column: position.column,
    sourceLine: source.split(/\r?\n/)[position.line - 1] ?? '',
    suggestion
  };
}

function skipQuotedString(source, start, language) {
  const quote = source[start];
  const triple = language === 'python' && (quote === "'" || quote === '"')
    && source.slice(start, start + 3) === quote.repeat(3);
  const delimiter = triple ? quote.repeat(3) : quote;
  let index = start + delimiter.length;
  while (index < source.length) {
    if (source[index] === '\\') { index += 2; continue; }
    if (source.startsWith(delimiter, index)) return {end: index + delimiter.length, closed: true};
    if (!triple && quote !== String.fromCharCode(96) && source[index] === '\n') return {end: index, closed: false};
    index++;
  }
  return {end: source.length, closed: false};
}

function skipRegexLiteral(source, start) {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') { index += 2; continue; }
    if (char === '\n' || char === '\r') return start + 1;
    if (char === '[') inCharacterClass = true;
    if (char === ']') inCharacterClass = false;
    if (char === '/' && !inCharacterClass) {
      index++;
      while (/[a-z]/i.test(source[index] ?? '')) index++;
      return index;
    }
    index++;
  }
  return start + 1;
}

function canStartRegex(source, index) {
  const prefix = source.slice(0, index).trimEnd();
  if (!prefix) return true;
  const last = prefix.at(-1);
  if (/[=(:,[!&|?{};\n]/.test(last)) return true;
  return /\b(return|case|throw|delete|typeof|void|instanceof|in|of|yield|await)$/.test(prefix);
}

function scanDelimiters(source, language, diagnostics) {
  const stack = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (language === 'python' && char === '#') {
      while (index < source.length && source[index] !== '\n') index++;
      continue;
    }
    if (language === 'javascript' && char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index++;
      continue;
    }
    if (language === 'javascript' && char === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      if (close < 0) {
        diagnostics.push(makeDiagnostic(source, index, 'error', 'JS_UNTERMINATED_COMMENT',
          'Comentário de bloco não foi fechado.', 'Adicione */ para fechar o comentário.'));
        return;
      }
      index = close + 2;
      continue;
    }
    if (char === "'" || char === '"' || (language === 'javascript' && char.charCodeAt(0) === 96)) {
      const result = skipQuotedString(source, index, language);
      if (!result.closed) diagnostics.push(makeDiagnostic(source, index, 'error',
        language === 'python' ? 'PY_UNTERMINATED_STRING' : 'JS_UNTERMINATED_STRING',
        'String não foi fechada corretamente.', 'Confira as aspas de abertura e fechamento.'));
      index = Math.max(result.end, index + 1);
      continue;
    }
    if (language === 'javascript' && char === '/' && canStartRegex(source, index)) {
      const end = skipRegexLiteral(source, index);
      if (end > index + 1) { index = end; continue; }
    }
    if (OPEN_TO_CLOSE[char]) stack.push({char, expected: OPEN_TO_CLOSE[char], index});
    else if (CLOSERS.has(char)) {
      const opening = stack.pop();
      if (!opening) diagnostics.push(makeDiagnostic(source, index, 'error', 'UNEXPECTED_CLOSER',
        'Delimitador de fechamento "' + char + '" sem abertura correspondente.',
        'Remova "' + char + '" ou adicione o delimitador de abertura correspondente.'));
      else if (opening.expected !== char) diagnostics.push(makeDiagnostic(source, index, 'error',
        'MISMATCHED_DELIMITER', 'Esperado "' + opening.expected + '", mas foi encontrado "' + char + '".',
        'Confira o par iniciado na linha ' + positionAt(source, opening.index).line + '.'));
    }
    index++;
  }
  for (const opening of stack.reverse()) diagnostics.push(makeDiagnostic(source, opening.index,
    'error', 'UNCLOSED_DELIMITER', 'Delimitador "' + opening.char + '" não foi fechado.',
    'Adicione "' + opening.expected + '" para fechar o bloco iniciado aqui.'));
}

function analyzeJavaScript(source, diagnostics) {
  const lines = source.split(/\r?\n/);
  let offset = 0;
  for (const text of lines) {
    const trimmed = text.trim();
    if (/\bconsole\.log\s*\(/.test(text)) diagnostics.push(makeDiagnostic(source,
      offset + text.indexOf('console.log'), 'info', 'JS_CONSOLE_LOG', 'console.log encontrado.',
      'Remova ou substitua por logging apropriado antes de publicar.'));

    const looseEquality = text.search(/(^|[^=!])==([^=]|$)/);
    if (looseEquality >= 0) {
      const index = offset + looseEquality + (text[looseEquality] === '=' ? 0 : 1);
      diagnostics.push(makeDiagnostic(source, index, 'warning', 'JS_LOOSE_EQUALITY',
        'Comparação com == permite coerção de tipos.', 'Use === quando precisar de comparação estrita.'));
    }

    const constWithoutValue = text.search(/^\s*const\s+(?:[A-Za-z_$][\w$]*|\{[^}]*\}|\[[^\]]*\])\s*;?\s*(?:\/\/.*)?$/);
    if (constWithoutValue >= 0) diagnostics.push(makeDiagnostic(source, offset + constWithoutValue,
      'error', 'JS_CONST_WITHOUT_INITIALIZER', 'Declaração const sem valor inicial.',
      'Atribua um valor na declaração ou use let quando a atribuição for posterior.'));

    const emptyAssignment = text.search(/=\s*(?:;|,|\))/);
    if (emptyAssignment >= 0) diagnostics.push(makeDiagnostic(source, offset + emptyAssignment,
      'error', 'JS_EMPTY_ASSIGNMENT', 'Atribuição sem expressão à direita.',
      'Adicione o valor ou a expressão que deve ser atribuída.'));

    const malformedDeclaration = text.search(/^\s*(?:const|let|var)\s*=|^\s*function\s*\(/);
    if (malformedDeclaration >= 0) diagnostics.push(makeDiagnostic(source, offset + malformedDeclaration,
      'error', 'JS_MALFORMED_DECLARATION', 'Declaração parece estar sem identificador.',
      'Adicione o nome da variável ou da função.'));

    if (/\beval\s*\(/.test(text)) diagnostics.push(makeDiagnostic(source,
      offset + text.indexOf('eval'), 'error', 'JS_EVAL_USAGE',
      'eval executa texto como código e amplia a superfície de ataque.',
      'Prefira uma função explícita ou um parser de dados.'));

    if (/\bdebugger\s*;?/.test(text)) diagnostics.push(makeDiagnostic(source,
      offset + text.indexOf('debugger'), 'warning', 'JS_DEBUGGER_STATEMENT',
      'Instrução debugger encontrada.', 'Remova a instrução antes de publicar.'));

    if (/\bTODO\b|\bFIXME\b/.test(text)) diagnostics.push(makeDiagnostic(source,
      offset + text.search(/\bTODO\b|\bFIXME\b/), 'info', 'PENDING_MARKER',
      'Marcador TODO/FIXME pendente.', 'Resolva ou documente a tarefa antes de finalizar.'));

    if (trimmed && text.length > 120) diagnostics.push(makeDiagnostic(source, offset + 120,
      'info', 'LONG_LINE', 'Linha com mais de 120 caracteres.',
      'Considere quebrar a linha para facilitar a leitura.'));
    offset += text.length + 1;
  }
}

function analyzePython(source, diagnostics) {
  const lines = source.split(/\r?\n/);
  let offset = 0;
  for (const text of lines) {
    const indent = text.match(/^[ \t]*/)?.[0] ?? '';
    const code = text.trim();

    if (indent.includes(' ') && indent.includes('\t')) diagnostics.push(makeDiagnostic(source,
      offset, 'warning', 'PY_MIXED_INDENTATION', 'Indentação mistura tabs e espaços.',
      'Padronize a indentação; quatro espaços por nível é uma convenção comum.'));

    const header = code.match(/^(async\s+def|def|class|if|elif|else|for|while|try|except|finally|with)\b/);
    if (header && !code.endsWith(':') && !code.endsWith('\\')) diagnostics.push(makeDiagnostic(source,
      offset + indent.length, 'error', 'PY_MISSING_COLON',
      'Cabeçalho de bloco Python parece estar sem dois-pontos.', 'Adicione : ao final do cabeçalho.'));

    if (/^[A-Za-z_]\w*\s*=\s*(?:#.*)?$/.test(code)) diagnostics.push(makeDiagnostic(source,
      offset + indent.length, 'error', 'PY_EMPTY_ASSIGNMENT',
      'Atribuição sem valor à direita.', 'Adicione uma expressão depois do sinal de =.'));

    if (/\bTODO\b|\bFIXME\b/.test(text)) diagnostics.push(makeDiagnostic(source,
      offset + text.search(/\bTODO\b|\bFIXME\b/), 'info', 'PENDING_MARKER',
      'Marcador TODO/FIXME pendente.', 'Resolva ou documente a tarefa antes de finalizar.'));
    offset += text.length + 1;
  }
}

function analyzeHtml(source, diagnostics) {
  const stack = [];
  const ids = new Map();
  const idPattern = /\bid\s*=\s*(['"])(.*?)\1/gi;
  for (const match of source.matchAll(idPattern)) {
    const id = match[2];
    if (ids.has(id)) diagnostics.push(makeDiagnostic(source, match.index, 'error', 'HTML_DUPLICATE_ID',
      'O id "' + id + '" aparece mais de uma vez.', 'Cada id deve identificar um único elemento.'));
    else ids.set(id, match.index);
  }

  const tagPattern = /<!--([\s\S]*?)-->|<\/?([a-z][\w:-]*)\b[^>]*>/gi;
  for (const match of source.matchAll(tagPattern)) {
    if (match[1] !== undefined) continue;
    const fullTag = match[0];
    const tag = match[2].toLowerCase();
    const closing = /^<\//.test(fullTag);
    const selfClosing = /\/>$/.test(fullTag);
    if (closing) {
      const opening = stack.pop();
      if (!opening) diagnostics.push(makeDiagnostic(source, match.index, 'error', 'HTML_UNEXPECTED_CLOSER',
        'Tag de fechamento </' + tag + '> sem abertura correspondente.',
        'Remova o fechamento extra ou adicione a tag de abertura.'));
      else if (opening.tag !== tag) diagnostics.push(makeDiagnostic(source, match.index, 'error', 'HTML_MISMATCHED_TAG',
        'Esperado </' + opening.tag + '>, mas foi encontrado </' + tag + '>.',
        'Confira a tag aberta na linha ' + positionAt(source, opening.index).line + '.'));
    } else if (!selfClosing && !HTML_VOID_TAGS.has(tag)) stack.push({tag, index: match.index});
  }
  for (const opening of stack.reverse()) diagnostics.push(makeDiagnostic(source, opening.index,
    'error', 'HTML_UNCLOSED_TAG', 'Tag <' + opening.tag + '> não foi fechada.',
    'Adicione </' + opening.tag + '>.'));
}

export class NexCodeEngine {
  detectLanguage(code = '') {
    const source = String(code);
    if (/<!doctype\s+html|<html\b|<body\b|<div\b/i.test(source)) return 'html';
    if (/^\s*(?:from\s+\w+\s+import|def\s+\w+|class\s+\w+\s*\(|async\s+def)\b/m.test(source)
      || /^\s*print\s*\(/m.test(source)) return 'python';
    if (/\b(const|let|var|function|class|import|export)\b|=>|\bconsole\./.test(source)) return 'javascript';
    return 'text';
  }

  analyze(code = '', language = 'auto') {
    if (typeof code !== 'string') throw new TypeError('O código deve ser uma string.');
    const resolvedLanguage = language === 'auto' ? this.detectLanguage(code) : language;
    const diagnostics = [];
    if (!['javascript', 'python', 'html', 'text'].includes(resolvedLanguage)) {
      throw new Error('Linguagem não suportada: ' + resolvedLanguage);
    }

    if (resolvedLanguage === 'javascript' || resolvedLanguage === 'python') {
      scanDelimiters(code, resolvedLanguage, diagnostics);
      if (resolvedLanguage === 'javascript') analyzeJavaScript(code, diagnostics);
      if (resolvedLanguage === 'python') analyzePython(code, diagnostics);
    } else if (resolvedLanguage === 'html') analyzeHtml(code, diagnostics);

    const severityRank = {error: 0, warning: 1, info: 2};
    diagnostics.sort((a, b) => a.line - b.line || a.column - b.column
      || severityRank[a.severity] - severityRank[b.severity]);
    const counts = {
      errors: diagnostics.filter(item => item.severity === 'error').length,
      warnings: diagnostics.filter(item => item.severity === 'warning').length,
      info: diagnostics.filter(item => item.severity === 'info').length
    };

    return {
      language: resolvedLanguage,
      lines: code ? code.split(/\r?\n/).length : 0,
      diagnostics,
      issues: diagnostics,
      counts,
      valid: counts.errors === 0,
      summary: counts.errors
        ? counts.errors + ' erro(s), ' + counts.warnings + ' aviso(s) e ' + counts.info + ' observação(ões)'
        : 'Nenhum erro estrutural detectado; ' + counts.warnings + ' aviso(s) e ' + counts.info + ' observação(ões)',
      testPlan: this.testPlan(resolvedLanguage),
      limitations: [
        'análise estática leve; não é um parser AST completo',
        'não executa código fornecido pelo usuário',
        'não substitui compilador, testes automatizados ou revisão humana'
      ]
    };
  }

  validate(code = '', language = 'auto') {
    return this.analyze(code, language);
  }

  testPlan(language = 'javascript') {
    const commands = {
      javascript: 'node --test',
      python: 'python -m unittest discover',
      html: 'Validar HTML com um validador W3C e testar no navegador',
      text: 'Nenhum comando de testes definido para texto puro'
    };
    return {
      language,
      command: commands[language] ?? commands.text,
      executionSupported: false,
      note: 'O NEX gera instruções de teste, mas não executa código arbitrário por segurança.'
    };
  }

  process(request = '') {
    if (typeof request !== 'string') throw new TypeError('A solicitação deve ser uma string.');
    const fence = String.fromCharCode(96).repeat(3);
    const fenced = request.match(new RegExp(fence + '([a-zA-Z0-9_+-]*)\\s*\\n([\\s\\S]*?)\\n?' + fence));
    if (fenced) {
      const language = this.normalizeLanguage(fenced[1]);
      return {type: 'analysis', source: fenced[2], result: this.analyze(fenced[2], language)};
    }
    const looksLikeCode = /\b(const|let|var|function|def|class|return|import|export)\b|=>|\bconsole\.log\s*\(|<html\b|<div\b/.test(request);
    if (looksLikeCode) return {type: 'analysis', source: request, result: this.analyze(request, 'auto')};
    return {type: 'scaffold', ...this.scaffold(request)};
  }

  normalizeLanguage(language = '') {
    const normalized = language.toLowerCase();
    if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(normalized)) return 'javascript';
    if (['py', 'python'].includes(normalized)) return 'python';
    if (['html', 'htm'].includes(normalized)) return 'html';
    return 'auto';
  }

  scaffoldWebsite(request = '') {
    const subjectMatch = request.match(/(?:para|sobre|de)\s+(.+)$/i);
    const subject = (subjectMatch?.[1] || '').replace(/[.!?]+$/g, '').trim().slice(0, 70);
    const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    const heading = subject ? 'Apresente ' + subject : 'Apresente seu projeto ao mundo';
    const indexHtml = "<!doctype html>\n<html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"description\" content=\"Projeto web criado com o NEX\"><title>Projeto web</title><link rel=\"stylesheet\" href=\"./styles.css\"><script type=\"module\" src=\"./src/main.js\"></script></head>\n<body><header class=\"site-header\"><a class=\"brand\" href=\"#inicio\">Projeto</a><nav aria-label=\"Navegação principal\"><a href=\"#sobre\">Sobre</a><a href=\"#recursos\">Recursos</a><a href=\"#contato\">Contato</a></nav></header>\n<main id=\"inicio\"><section class=\"hero\"><p class=\"eyebrow\">UM NOVO PROJETO</p><h1>##HEADING##</h1><p class=\"lead\">Uma página clara, rápida e adaptável para apresentar sua ideia, seus serviços e facilitar o contato.</p><a class=\"button\" href=\"#contato\">Fale conosco</a></section>\n<section class=\"section\" id=\"sobre\"><p class=\"eyebrow\">SOBRE</p><h2>Uma presença digital bem construída</h2><p>Apresente aqui a história, a proposta e o diferencial do seu projeto. Edite este conteúdo para refletir o negócio real.</p></section>\n<section class=\"section feature-grid\" id=\"recursos\"><article class=\"feature\"><h3>Clareza</h3><p>Informações organizadas para que visitantes encontrem o que precisam.</p></article><article class=\"feature\"><h3>Velocidade</h3><p>HTML, CSS e JavaScript nativos, sem dependências externas.</p></article><article class=\"feature\"><h3>Responsivo</h3><p>Layout que se adapta a celulares, tablets e computadores.</p></article></section>\n<section class=\"section contact\" id=\"contato\"><p class=\"eyebrow\">CONTATO</p><h2>Vamos conversar?</h2><form id=\"contact-form\"><label>Seu nome<input name=\"name\" autocomplete=\"name\" required maxlength=\"100\"></label><label>Seu e-mail<input name=\"email\" type=\"email\" autocomplete=\"email\" required maxlength=\"160\"></label><label>Mensagem<textarea name=\"message\" rows=\"4\" required maxlength=\"2000\"></textarea></label><button class=\"button\" type=\"submit\">Enviar mensagem</button><p id=\"form-status\" role=\"status\" aria-live=\"polite\"></p></form></section></main>\n<footer><span>Projeto</span><span>© <span id=\"year\"></span></span></footer></body></html>".replace('##HEADING##', escapeHtml(heading));
    const styles = ":root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,\"Segoe UI\",sans-serif;color:#182238;background:#f6f8fc;font-synthesis:none;text-rendering:optimizeLegibility}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-width:320px;line-height:1.6}.site-header{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;padding:16px max(5vw,20px);background:#ffffffed;border-bottom:1px solid #e4e9f2;backdrop-filter:blur(12px)}a{color:inherit;text-decoration:none}.brand{font-weight:800;letter-spacing:.04em}.site-header nav{display:flex;gap:24px;font-size:.94rem;color:#536079}.site-header nav a:hover{color:#315de8}.hero{padding:clamp(76px,12vw,150px) max(8vw,24px);background:linear-gradient(135deg,#edf2ff,#f7fbff);text-align:center}.hero h1{max-width:900px;margin:8px auto 16px;font-size:clamp(2.3rem,6vw,4.8rem);line-height:1.04;letter-spacing:-.05em}.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.16em;color:#4266da}.lead{max-width:650px;margin:0 auto 28px;color:#5c6880;font-size:1.12rem}.button{display:inline-flex;justify-content:center;align-items:center;border:0;border-radius:12px;padding:12px 20px;background:#315de8;color:white;font:inherit;font-weight:700;cursor:pointer}.button:hover{background:#2149c7}.section{width:min(1000px,88%);margin:0 auto;padding:76px 0}.section h2{margin:4px 0 12px;font-size:clamp(1.8rem,4vw,2.6rem);line-height:1.15;letter-spacing:-.035em}.section>p:not(.eyebrow){max-width:720px;color:#5c6880}.feature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.feature{padding:24px;border:1px solid #e1e7f1;border-radius:18px;background:white}.feature h3{margin-top:0}.feature p{margin-bottom:0;color:#657189}.contact{padding-top:28px}.contact form{display:grid;gap:14px;max-width:620px}.contact label{display:grid;gap:6px;font-weight:650}.contact input,.contact textarea{width:100%;padding:12px 14px;border:1px solid #d4dceb;border-radius:10px;background:white;font:inherit}.contact input:focus,.contact textarea:focus{outline:3px solid #315de833;border-color:#315de8}#form-status{min-height:1.5em;color:#245d42}footer{display:flex;justify-content:space-between;padding:24px max(6vw,20px);background:#17233e;color:#dce5ff}@media(max-width:680px){.site-header{padding:14px 18px}.site-header nav{gap:12px;font-size:.85rem}.feature-grid{grid-template-columns:1fr}.section{padding:54px 0}.lead{font-size:1rem}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}";
    const mainJs = "export function getSiteConfig(){return {name:\"Projeto\",version:\"0.1.0\"};}\nexport function initializeSite(root=typeof document!==\"undefined\"?document:null){\n  if(!root)return false;\n  const year=root.querySelector(\"#year\");\n  if(year)year.textContent=String(new Date().getFullYear());\n  const form=root.querySelector(\"#contact-form\");\n  if(form&&!form.dataset.initialized){\n    form.dataset.initialized=\"true\";\n    form.addEventListener(\"submit\",event=>{\n      event.preventDefault();\n      const status=root.querySelector(\"#form-status\");\n      if(status)status.textContent=\"Formulário validado. Conecte um serviço de envio para receber mensagens.\";\n      form.reset();\n    });\n  }\n  return true;\n}\nif(typeof document!==\"undefined\")initializeSite(document);";
    const testJs = "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport {getSiteConfig,initializeSite} from \"../src/main.js\";\ntest(\"site config has a name and version\",()=>{\n  const config=getSiteConfig();\n  assert.equal(config.name,\"Projeto\");\n  assert.equal(config.version,\"0.1.0\");\n});\ntest(\"initializeSite is safe without a DOM\",()=>{\n  assert.equal(initializeSite(null),false);\n});";
    return {kind:'website',language:'html-css-javascript',files:['README.md','index.html','styles.css','src/main.js','tests/main.test.js','package.json'],
      fileContents:{
        'README.md':['# Site gerado pelo NEX','','Pedido original: '+request,'','Abra index.html por um servidor HTTP estático. O formulário demonstra validação local; conecte um serviço de backend para receber mensagens.'].join('\\n'),
        'index.html':indexHtml,'styles.css':styles,'src/main.js':mainJs,'tests/main.test.js':testJs,
        'package.json':JSON.stringify({name:'nex-generated-website',version:'0.1.0',private:true,type:'module',scripts:{test:'node --test'}},null,2)
      },testCommand:'node --test',notes:['Layout responsivo e acessível.','Sem dependências de terceiros.','O formulário ainda não envia dados para um servidor.']};
  }

  scaffold(request = '') {
    if (/(site|website|pagina|página|landing\s+page|portfolio|portfólio|loja|dashboard|frontend|front-end)/i.test(request)) {
      return this.scaffoldWebsite(request);
    }

    if (/\\b(site|website|pagina|página|landing\\s+page|portfolio|portfólio|loja|dashboard|frontend|front-end)\\b/i.test(request)) {
      return this.scaffoldWebsite(request);
    }
    const language = request.toLowerCase().includes('python') ? 'python' : 'javascript';
    if (language === 'python') {
      const files = ['README.md', 'pyproject.toml', 'src/__init__.py', 'src/main.py', 'tests/__init__.py', 'tests/test_main.py'];
      return {
        language, files,
        fileContents: {
          'README.md': '# Projeto NEX\n\nEstrutura inicial gerada para: ' + request + '\n\nExecute os testes com python -m unittest discover -s tests.\n',
          'pyproject.toml': '[project]\nname = "nex-generated-project"\nversion = "0.1.0"\nrequires-python = ">=3.10"\n',
          'src/__init__.py': '',
          'src/main.py': 'def main():\n    return "Olá, mundo!"\n\n\nif __name__ == "__main__":\n    print(main())\n',
          'tests/__init__.py': '',
          'tests/test_main.py': 'import unittest\nfrom src.main import main\n\nclass MainTests(unittest.TestCase):\n    def test_main_returns_greeting(self):\n        self.assertEqual(main(), "Olá, mundo!")\n\nif __name__ == "__main__":\n    unittest.main()\n'
        },
        testCommand: 'python -m unittest discover -s tests'
      };
    }
    const files = ['README.md', 'package.json', 'src/main.js', 'tests/main.test.js'];
    return {
      language, files,
      fileContents: {
        'README.md': '# Projeto NEX\n\nEstrutura inicial gerada para: ' + request + '\n\nExecute os testes com node --test.\n',
        'package.json': JSON.stringify({name: 'nex-generated-project', version: '0.1.0', type: 'module', scripts: {test: 'node --test'}}, null, 2),
        'src/main.js': 'export function main() {\n  return "Olá, mundo!";\n}\n',
        'tests/main.test.js': 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport {main} from "../src/main.js";\n\ntest("main returns a greeting", () => {\n  assert.equal(main(), "Olá, mundo!");\n});\n'
      },
      testCommand: 'node --test'
    };
  }
}
