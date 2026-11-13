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

  scaffoldBarbershop(request = '') {
    const indexHtml = [
      '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Corte Nobre: cortes, barba e cuidado pessoal."><title>Corte Nobre | Barbearia</title><link rel="stylesheet" href="./styles.css"><script type="module" src="./src/main.js"></script></head>',
      '<body><header class="site-header"><a class="brand" href="#inicio"><span class="mark">CN</span><span>CORTE <b>NOBRE</b></span></a><nav><a href="#sobre">A barbearia</a><a href="#servicos">Serviços</a><a href="#estilos">Estilos</a><a href="#agendamento">Agendamento</a></nav><a class="header-cta" href="#agendamento">Agendar horário ↗</a></header>',
      '<main id="inicio"><section class="hero"><div><p class="eyebrow">BARBEARIA • EST. 2024</p><h1>Seu estilo.<br><em>Sua assinatura.</em></h1><p class="lead">Cortes precisos, barba alinhada e atendimento sem pressa. Um espaço para renovar o visual e sair com a sua melhor versão.</p><a class="button" href="#agendamento">Escolher meu horário →</a><p class="rating">★★★★★ <span>Seu cuidado começa na cadeira.</span></p></div><div class="hero-art"><div class="art-ring"></div><div class="chair"><i></i><b></b><span></span></div><p>CORTE<br><strong>NOBRE</strong><small>BARBER CLUB</small></p></div></section>',
      '<section class="section intro" id="sobre"><div><p class="eyebrow">MAIS QUE UM CORTE</p><h2>Um tempo para<br><em>cuidar de você.</em></h2></div><div><p>Na Corte Nobre, tradição e técnica se encontram em um atendimento próximo, com atenção ao formato do rosto, ao seu estilo e aos detalhes que fazem diferença.</p><small>Texto demonstrativo: substitua pela história real, equipe e diferenciais da barbearia.</small></div></section>',
      '<section class="section services" id="servicos"><p class="eyebrow">MENU DE SERVIÇOS</p><h2>O cuidado está <em>nos detalhes.</em></h2><p>Os valores são demonstrativos e devem ser ajustados pelo estabelecimento.</p><div class="service-grid"><article><span>01</span><h3>Corte masculino</h3><p>Do clássico ao degradê, com acabamento cuidadoso.</p><strong>R$ 45</strong></article><article><span>02</span><h3>Barba completa</h3><p>Desenho, toalha quente e acabamento.</p><strong>R$ 30</strong></article><article class="featured"><span>03</span><h3>Corte + barba</h3><p>O combo para sair com o visual renovado.</p><strong>R$ 65</strong></article><article><span>04</span><h3>Sobrancelha</h3><p>Limpeza e desenho natural.</p><strong>R$ 15</strong></article></div><small>* Preços são exemplos editáveis.</small></section>',
      '<section class="styles-section" id="estilos"><div class="section"><p class="eyebrow">INSPIRAÇÃO</p><h2>Encontre seu <em>próximo visual.</em></h2><div class="style-grid"><article><div class="style-visual one">01</div><h3>Degradê moderno</h3><p>Laterais marcadas, transição suave.</p></article><article><div class="style-visual two">02</div><h3>Clássico alinhado</h3><p>Elegância que nunca sai de moda.</p></article><article><div class="style-visual three">03</div><h3>Barba desenhada</h3><p>Contorno limpo e acabamento preciso.</p></article></div><small>Ilustrações de referência, não fotografias de clientes.</small></div></section>',
      '<section class="section booking" id="agendamento"><div><p class="eyebrow">RESERVE SEU MOMENTO</p><h2>Seu próximo corte <em>começa aqui.</em></h2><p>Preencha os dados para preparar uma solicitação de horário. O envio real precisa ser conectado ao WhatsApp ou a um serviço de agendamento.</p><p class="detail"><b>⌖ Endereço</b><br>Adicione rua, número e bairro</p><p class="detail"><b>◷ Funcionamento</b><br>Edite os dias e horários reais</p></div>',
      '<form id="booking-form"><h3>Solicitar agendamento</h3><label>Seu nome<input name="name" autocomplete="name" required maxlength="100" placeholder="Como podemos chamar você?"></label><label>WhatsApp<input name="phone" type="tel" autocomplete="tel" required maxlength="24" placeholder="(00) 00000-0000"></label><label>Serviço desejado<select name="service" required><option value="">Selecione um serviço</option><option>Corte masculino</option><option>Barba completa</option><option>Corte + barba</option><option>Sobrancelha</option></select></label><div class="form-row"><label>Data preferida<input name="date" id="booking-date" type="date" required></label><label>Horário<select name="time" required><option value="">Escolha</option><option>09:00</option><option>10:00</option><option>11:00</option><option>13:00</option><option>14:00</option><option>15:00</option><option>16:00</option><option>17:00</option><option>18:00</option></select></label></div><button class="button" type="submit">Preparar solicitação →</button><p id="form-status" role="status" aria-live="polite"></p></form></section></main>',
      '<footer><a class="brand" href="#inicio"><span class="mark">CN</span><span>CORTE <b>NOBRE</b></span></a><p>© <span id="year"></span> Corte Nobre. Conteúdo demonstrativo.</p><a href="#inicio">Voltar ao topo ↑</a></footer></body></html>'
    ].join('\n');
    const styles = ':root{color-scheme:dark;--bg:#11110f;--panel:#1b1a17;--gold:#c8a66a;--light:#e2c58f;--text:#f3eee4;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-width:320px;line-height:1.6}a{color:inherit;text-decoration:none}.site-header{min-height:76px;padding:14px 5%;display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:1px solid #ffffff12;background:#11110ff2;position:sticky;top:0;z-index:5}.brand{display:flex;align-items:center;gap:10px;font-size:.85rem;letter-spacing:.15em}.brand b{color:var(--light)}.mark{width:36px;height:36px;border:1px solid var(--gold);display:grid;place-items:center;color:var(--gold);font-family:Georgia,serif}.site-header nav{display:flex;gap:18px;color:#c5beb1;font-size:.8rem}.header-cta{border:1px solid #7f6947;padding:9px 12px;color:var(--light);font-size:.76rem}.hero{min-height:540px;padding:65px 7%;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:5vw;background:radial-gradient(ellipse at 80% 45%,#3a2d1d99,transparent 48%),linear-gradient(110deg,#11110f,#191711)}.hero h1,h2{font-family:Georgia,"Times New Roman",serif;font-weight:400;line-height:1.06;letter-spacing:-.035em}.hero h1{font-size:clamp(3rem,6vw,5.6rem);margin:12px 0 20px}.hero h1 em,h2 em{color:var(--light)}.eyebrow{font-size:.7rem;letter-spacing:.2em;color:var(--gold);font-weight:750}.lead{max-width:500px;color:#c0b8a9}.button{display:inline-flex;background:var(--gold);color:#19150f;padding:13px 18px;font-weight:750;margin-top:15px}.rating{margin-top:35px;color:var(--gold)}.rating span{color:#aaa397;font-size:.76rem;margin-left:8px}.hero-art{height:350px;position:relative;display:grid;place-items:center;border:1px solid #ad895044;background:radial-gradient(circle,#7b603124,transparent 56%),linear-gradient(145deg,#252017,#13120f)}.art-ring{position:absolute;width:270px;height:270px;border:1px solid #c8a66a55;border-radius:50%;box-shadow:0 0 0 25px #c8a66a0b}.chair{position:relative;width:150px;height:225px}.chair i{position:absolute;top:0;left:48px;width:56px;height:46px;background:linear-gradient(90deg,#282722,#716044,#24231f);border:1px solid #b7955d;border-radius:12px}.chair b{position:absolute;top:45px;left:31px;width:90px;height:115px;background:linear-gradient(90deg,#25241f,#51452f,#211f1a);border:2px solid #a58752;border-radius:18px}.chair span{position:absolute;top:150px;left:7px;width:136px;height:52px;background:linear-gradient(90deg,#25231e,#806544,#29251e);border:2px solid #a58752;border-radius:12px}.hero-art>p{position:absolute;right:18px;top:14px;color:var(--light);font:.8rem Georgia,serif;letter-spacing:.16em}.hero-art strong{font-size:1.2rem}.hero-art small{display:block;font:.55rem Arial,sans-serif}.section{width:min(1120px,88%);margin:auto;padding:76px 0}.intro{display:grid;grid-template-columns:1fr 1fr;gap:7vw;align-items:center}.section h2{font-size:clamp(2.5rem,4vw,4rem);margin:0}.intro>div:nth-child(2){color:#bcb4a6}.intro small,.services small,.styles-section small{font-size:.72rem;color:#92897a}.service-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:28px}.service-grid article{min-height:210px;padding:20px 16px;background:var(--panel);border:1px solid #ffffff10;position:relative}.service-grid article.featured{border-color:#a98b5a;background:linear-gradient(145deg,#30271a,#1b1a17)}.service-grid article span{position:absolute;right:14px;top:10px;color:#746b5d}.service-grid h3{font:1.15rem Georgia,serif;margin-top:28px}.service-grid p{color:#a9a194;font-size:.78rem;min-height:48px}.service-grid strong{display:block;border-top:1px solid #38352e;padding-top:10px;color:var(--light);font:1.3rem Georgia,serif}.styles-section{background:#191813}.style-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin:25px 0}.style-grid article{background:#211f19;padding:12px;border:1px solid #ffffff10}.style-visual{height:160px;display:grid;place-items:start end;padding:10px;color:var(--light);background:radial-gradient(ellipse at 50% 85%,#b58d5144,transparent 65%),linear-gradient(135deg,#383022,#191813)}.style-visual:after{content:"";width:75px;height:110px;border-radius:48%;border:1px solid #c8a66a77;background:linear-gradient(90deg,#181613,#62503a,#171613);margin:auto}.style-visual.two{background:linear-gradient(135deg,#292c2b,#181a19)}.style-visual.three{background:linear-gradient(135deg,#33251e,#171412)}.style-grid h3{font:1.1rem Georgia,serif;margin:14px 8px 0}.style-grid p{color:#9c9487;font-size:.76rem;margin:4px 8px 12px}.booking{display:grid;grid-template-columns:.9fr 1.1fr;gap:7vw;align-items:start}.booking>div>p:not(.eyebrow){color:#aaa397}#booking-form{background:var(--panel);border:1px solid #38352e;padding:25px;display:grid;gap:12px}#booking-form h3{font:1.5rem Georgia,serif;margin:0}#booking-form label{display:grid;gap:6px;color:#c5bba9;font-size:.76rem}#booking-form input,#booking-form select{width:100%;min-height:42px;padding:10px;background:#11110f;border:1px solid #454034;color:var(--text);font:inherit}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}#form-status{min-height:1.4em;color:var(--light);font-size:.75rem}footer{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:24px 5%;border-top:1px solid #38352e;color:#989082;font-size:.72rem}footer .brand{color:var(--text)}@media(max-width:850px){.site-header nav{gap:10px}.hero{grid-template-columns:1fr}.hero-art{max-width:550px;width:100%;margin:auto}.service-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.site-header{flex-wrap:wrap;padding:12px 16px}.site-header nav{order:3;width:100%;justify-content:space-between;font-size:.68rem}.hero{padding:45px 20px}.hero-art{height:270px}.section{padding:55px 0}.intro,.booking{grid-template-columns:1fr;gap:20px}.service-grid{grid-template-columns:1fr 1fr;gap:8px}.service-grid article{padding:15px 11px}.style-grid{grid-template-columns:1fr}.form-row{grid-template-columns:1fr}#booking-form{padding:18px 14px}footer{flex-wrap:wrap}}';
    const mainJs = 'export function getSiteConfig(){return {name:"Corte Nobre",version:"0.2.0",businessType:"barbearia"};}\n' +
      'export function initializeSite(root=typeof document!=="undefined"?document:null){if(!root)return false;const year=root.querySelector("#year");if(year)year.textContent=String(new Date().getFullYear());const date=root.querySelector("#booking-date");if(date){const today=new Date();date.min=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);}const form=root.querySelector("#booking-form");if(form&&!form.dataset.initialized){form.dataset.initialized="true";form.addEventListener("submit",event=>{event.preventDefault();const status=root.querySelector("#form-status");if(!form.reportValidity())return;if(status)status.textContent="Solicitação preenchida. Conecte este formulário ao WhatsApp ou a um serviço de backend para receber agendamentos.";form.reset();});}return true;}\nif(typeof document!=="undefined")initializeSite(document);';
    const testJs = 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport {getSiteConfig,initializeSite} from "../src/main.js";\ntest("barbershop config is specific",()=>{const config=getSiteConfig();assert.equal(config.name,"Corte Nobre");assert.equal(config.businessType,"barbearia");});\ntest("initializer is safe without DOM",()=>{assert.equal(initializeSite(null),false);});';
    return {kind:'website',businessType:'barbershop',language:'html-css-javascript',files:['README.md','index.html','styles.css','src/main.js','tests/main.test.js','package.json'],
      fileContents:{'README.md':['# Corte Nobre — site de barbearia','','Pedido original: '+request,'','Serviços e preços são demonstrativos. Ajuste nome, valores, endereço, horários, equipe e referências visuais antes de publicar.','','O formulário valida os campos no navegador, mas não envia agendamentos. Conecte WhatsApp, API ou serviço de reservas antes de usar em produção.','','Abra index.html por um servidor HTTP estático. A prévia isolada pode ser aberta pelo NEX.','','Testes: node --test.'].join('\n'),'index.html':indexHtml,'styles.css':styles,'src/main.js':mainJs,'tests/main.test.js':testJs,'package.json':JSON.stringify({name:'corte-nobre-barbearia',version:'0.2.0',private:true,type:'module',scripts:{test:'node --test'}},null,2)},
      testCommand:'node --test',notes:['Site personalizado para barbearia, com visual responsivo.','Serviços e preços são exemplos editáveis.','Formulário ainda precisa de integração para receber agendamentos.']};
  }

  scaffoldGuessingGame(request = '') {
    const indexHtml = [
      '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Jogo de adivinhação de números"><title>Desafio dos Números</title><link rel="stylesheet" href="./styles.css"><script type="module" src="./src/main.js"></script></head>',
      '<body><main class="game-shell"><header><p class="eyebrow">MINI GAME • JAVASCRIPT</p><h1>Desafio dos <span>números</span></h1><p class="intro">Estou pensando em um número de 1 a 100. Será que você consegue descobrir?</p></header>',
      '<section class="game-card"><div class="range"><span>01</span><span>DESAFIO 1 — 100</span><span>100</span></div><h2>Qual é o seu palpite?</h2><form id="guess-form"><label class="sr-only" for="guess-input">Digite um número de 1 a 100</label><input id="guess-input" type="number" min="1" max="100" step="1" required placeholder="Seu número"><button type="submit">Tentar número →</button></form><p id="game-status" role="status" aria-live="polite">Faça seu primeiro palpite.</p><div class="game-stats"><div><span>TENTATIVAS</span><strong id="attempt-count">0</strong></div><div><span>FAIXA</span><strong>1–100</strong></div></div><button id="restart-game" class="restart" type="button">↻ Começar outra rodada</button></section><p class="footnote">Jogo local, sem cadastro e sem dependências externas.</p></main></body></html>'
    ].join('\n');
    const styles = ':root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#f4f5fb;background:#0d1020}*{box-sizing:border-box}body{margin:0;min-width:320px;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 50% 0%,#30366b,#151a36 42%,#0d1020 80%)}.game-shell{width:min(100%,640px);text-align:center}.eyebrow{color:#9daaff;font-size:.72rem;letter-spacing:.2em;font-weight:800}.game-shell h1{font-size:clamp(2.6rem,8vw,4.8rem);line-height:1.05;letter-spacing:-.06em;margin:10px 0}.game-shell h1 span{color:#9daaff}.intro{max-width:470px;margin:0 auto 30px;color:#afb7d2;line-height:1.6}.game-card{padding:clamp(22px,5vw,38px);border:1px solid #414a78;border-radius:24px;background:linear-gradient(160deg,#22294b,#171c35);box-shadow:0 25px 70px #0006}.range{display:flex;justify-content:space-between;color:#9daaff;font-size:.68rem;letter-spacing:.16em}.game-card h2{font-size:1.35rem;margin:30px 0 18px}.game-card form{display:flex;gap:10px}.game-card input{flex:1;min-width:0;padding:14px 15px;background:#11162c;border:1px solid #505b91;border-radius:12px;color:white;font:inherit;font-size:1.1rem}.game-card input:focus{outline:2px solid #9daaff}.game-card form button{padding:14px 17px;border:0;border-radius:12px;background:#a9b4ff;color:#141a38;font:inherit;font-weight:800;cursor:pointer}.game-card #game-status{min-height:27px;color:#c5cffd;font-weight:650;margin:22px 0}.game-stats{display:flex;justify-content:center;gap:70px;border-top:1px solid #ffffff18;border-bottom:1px solid #ffffff18;padding:17px 0}.game-stats div{display:grid;gap:3px}.game-stats span{font-size:.62rem;letter-spacing:.15em;color:#8b97c0}.game-stats strong{font-size:1.35rem;color:#e9ecff}.restart{margin-top:22px;border:1px solid #606b9d;border-radius:10px;background:transparent;color:#d8defa;padding:10px 14px;font:inherit;font-size:.82rem;cursor:pointer}.footnote{margin-top:23px;color:#69769e;font-size:.73rem}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:520px){.game-card form{flex-direction:column}.game-card form button{width:100%}.game-stats{gap:45px}}';
    const mainJs = 'export function createGameState(secretNumber=Math.floor(Math.random()*100)+1){if(!Number.isInteger(secretNumber)||secretNumber<1||secretNumber>100)throw new RangeError("O número secreto deve ser um inteiro entre 1 e 100.");return {secretNumber,attempts:0,finished:false,history:[]};}\n' +
      'export function submitGuess(state,rawGuess){if(!state||!Number.isInteger(state.secretNumber))throw new TypeError("Estado de jogo inválido.");const guess=Number(rawGuess);if(!Number.isInteger(guess)||guess<1||guess>100)return {state,message:"Digite um número inteiro de 1 a 100.",accepted:false};if(state.finished)return {state,message:"A rodada terminou. Comece outra partida.",accepted:false};const attempts=state.attempts+1,finished=guess===state.secretNumber;const nextState={...state,attempts,finished,history:[...state.history,guess]};const message=finished?"Acertou! Você descobriu em "+attempts+" tentativa(s).":guess<state.secretNumber?"Muito baixo. Tente um número maior.":"Muito alto. Tente um número menor.";return {state:nextState,message,accepted:true};}\n' +
      'export function initializeGame(root=typeof document!=="undefined"?document:null){if(!root)return false;const form=root.querySelector("#guess-form"),input=root.querySelector("#guess-input"),status=root.querySelector("#game-status"),counter=root.querySelector("#attempt-count"),restart=root.querySelector("#restart-game");if(!form||!input||!status||!counter||!restart)return false;let state=createGameState();form.addEventListener("submit",event=>{event.preventDefault();const result=submitGuess(state,input.value);if(result.accepted){state=result.state;counter.textContent=String(state.attempts);}status.textContent=result.message;if(state.finished)input.disabled=true;else input.focus();input.value="";});restart.addEventListener("click",()=>{state=createGameState();counter.textContent="0";status.textContent="Nova rodada. Faça seu primeiro palpite.";input.disabled=false;input.value="";input.focus();});return true;}\nif(typeof document!=="undefined")initializeGame(document);';
    const testJs = 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport {createGameState,submitGuess} from "../src/main.js";\n' +
      'test("creates a valid game state",()=>{assert.deepEqual(createGameState(42),{secretNumber:42,attempts:0,finished:false,history:[]});});\n' +
      'test("gives low and high hints",()=>{const initial=createGameState(42);assert.match(submitGuess(initial,20).message,/Muito baixo/);assert.match(submitGuess(initial,80).message,/Muito alto/);});\n' +
      'test("finishes when the guess is correct",()=>{const result=submitGuess(createGameState(42),42);assert.equal(result.state.finished,true);assert.equal(result.state.attempts,1);assert.match(result.message,/Acertou/);});\n' +
      'test("rejects invalid guesses without counting",()=>{const result=submitGuess(createGameState(42),"abc");assert.equal(result.accepted,false);assert.equal(result.state.attempts,0);});\n' +
      'test("rejects guesses after the game has finished",()=>{const won=submitGuess(createGameState(42),42).state;assert.equal(submitGuess(won,50).accepted,false);});\n' +
      'test("rejects a secret number outside the range",()=>{assert.throws(()=>createGameState(101),/entre 1 e 100/);});';
    return {kind:'game',gameType:'number-guessing',language:'html-css-javascript',files:['README.md','index.html','styles.css','src/main.js','tests/main.test.js','package.json'],
      fileContents:{'README.md':['# Desafio dos Números','','Pedido original: '+request,'','Jogo de navegador em JavaScript. Abra index.html por um servidor HTTP estático.','','Digite um número inteiro entre 1 e 100. O jogo informa se o palpite está abaixo ou acima do número secreto.','','Execute os testes com node --test.'].join('\n'),'index.html':indexHtml,'styles.css':styles,'src/main.js':mainJs,'tests/main.test.js':testJs,'package.json':JSON.stringify({name:'nex-number-guessing-game',version:'0.1.0',private:true,type:'module',scripts:{test:'node --test'}},null,2)},
      testCommand:'node --test',notes:['Jogo de navegador funcional.','Lógica central testável com node --test.','Sem dependências externas.']};
  }
  scaffoldWebsite(request = '') {
    const subjectMatch = request.match(/(?:para|sobre|de)\s+(.+)$/i);
    const subject = (subjectMatch?.[1] || '').replace(/[.!?]+$/g, '').trim().slice(0, 70);
    const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const heading = subject ? 'Site de ' + subject : 'Apresente seu projeto ao mundo';
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
    const normalized = String(request).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
    if (/\b(jogo|game|adivinh|guess)\b/.test(normalized)) return this.scaffoldGuessingGame(request);
    if (/\b(site|website|pagina|landing page|portfolio|loja|dashboard|frontend|front end|barbearia|barbeiro)\b/.test(normalized)) {
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
