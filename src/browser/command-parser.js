const NORMALIZE = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

function extractTarget(value) {
  const text = String(value || '').trim();
  const quoted = text.match(/["'“”‘’]([^"'“”‘’]{1,200})["'“”‘’]/);
  if (quoted) return quoted[1].trim();
  return text
    .split(/\b(?:procure|busque|role|desca|suba|se necessario|nao clique|não clique|depois informe|informe quais|e informe|em seguida)\b/i)[0]
    .replace(/[.,;:]+$/,'')
    .trim();
}

export function parseNexBrowserCommand(value) {
  const text = String(value || '').trim();
  const normalized = NORMALIZE(text);
  let match;

  if (/^(?:entre|acesse|abra|conecte(?:-se)?|use) (?:no|ao|a )?(?:meu )?navegador$/.test(normalized) ||
      /^(?:conectar|verificar) (?:meu )?navegador$/.test(normalized) ||
      /^(?:conecte|conectar) (?:a )?extensao$/.test(normalized)) {
    return {type:'STATUS'};
  }

  // A compound instruction must not be mistaken for a single browser action.
  // The caller can then send it to the task planner instead.
  const requestedText = normalized.replace(/\bsem\b[^.]*\.?/g, ' ');
  const asksToReadPage =
    /\b(?:ler|leia|leitura)\b/.test(requestedText) &&
    /\b(?:pagina|aba|conteudo|texto)\b/.test(requestedText) &&
    !/\b(?:clicar|preencher|enviar|submeter|navegar|abrir|marcar|selecionar)\b/.test(requestedText);
  if (asksToReadPage || /^(?:nex )?(?:ler|leia) (?:a )?pagina$/.test(normalized)) {
    return {type:'READ_PAGE'};
  }

  if ((match = /^(?:nex )?(?:abrir|navegar(?: para)?) (https:\/\/\S+)$/i.exec(text))) {
    return {type:'NAVIGATE',url:match[1]};
  }

  if ((match = /^(?:nex )?(?:marcar|marque|selecionar|selecione|assinalar|assinale|escolher|escolha)\s+(?:a\s+op[cç][aã]o\s+)?(.+?)\s+(?:na|em|da)\s+quest[aã]o\s*0?(\d+)$/i.exec(text))) {
    const option = extractTarget(match[1]);
    return option ? {type:'SELECT_OPTION',option,question:'questão '+Number(match[2])} : null;
  }

  if ((match = /^(?:nex )?(?:passar|passe|posicionar|colocar) (?:o )?mouse (?:em|sobre|no|na) ([\s\S]+)$/i.exec(text)) ||
      (match = /^(?:nex )?hover (?:em|sobre) ([\s\S]+)$/i.exec(text))) {
    const target = extractTarget(match[1]);
    return target ? {type:'HOVER',target} : null;
  }
  if ((match = /^(?:nex )?(?:clicar|clique) (?:em|no|na) ([\s\S]+)$/i.exec(text))) {
    const target = extractTarget(match[1]);
    return target ? {type:'CLICK',target} : null;
  }
  if ((match = /^(?:nex )?(?:preencher|preencha) (?:o )?campo (.*?) com ([\s\S]+)$/i.exec(text))) {
    return {type:'FILL_FIELD',field:match[1].trim(),value:match[2]};
  }
  if (/^(?:nex )?voltar$/.test(normalized)) return {type:'BACK'};
  if (/^(?:nex )?avancar$/.test(normalized)) return {type:'FORWARD'};
  if (/^(?:nex )?recarregar$/.test(normalized)) return {type:'RELOAD'};
  return null;
}
