const NORMALIZE = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

export function parseNexBrowserCommand(value) {
  const text = String(value || '').trim();
  const normalized = NORMALIZE(text);
  let match;

  if (/^(?:entre|acesse|abra|conecte(?:-se)?|use) (?:no|ao|a )?(?:meu )?navegador$/.test(normalized) ||
      /^(?:conectar|verificar) (?:meu )?navegador$/.test(normalized) ||
      /^(?:conecte|conectar) (?:a )?extensao$/.test(normalized)) {
    return {type:'STATUS'};
  }

  // Ignore action verbs explicitly negated by phrases such as "sem clicar ou enviar".
  const requestedText = normalized.replace(/\bsem\b[^.]*\.?/g, ' ');
  const asksToReadPage =
    /\b(?:ler|leia|leitura)\b/.test(requestedText) &&
    /\b(?:pagina|aba|conteudo|texto)\b/.test(requestedText) &&
    !/\b(?:clicar|preencher|enviar|submeter|navegar|abrir)\b/.test(requestedText);
  if (asksToReadPage || /^(?:nex )?(?:ler|leia) (?:a )?pagina$/.test(normalized)) {
    return {type:'READ_PAGE'};
  }

  if ((match = /^(?:nex )?(?:abrir|navegar(?: para)?) (https:\/\/\S+)$/i.exec(text))) {
    return {type:'NAVIGATE',url:match[1]};
  }
  if ((match = /^(?:nex )?clicar em (.+)$/i.exec(text))) {
    return {type:'CLICK',target:match[1].replace(/^["']|["']$/g,'').trim()};
  }
  if ((match = /^(?:nex )?preencher (.*?) com ([\s\S]+)$/i.exec(text))) {
    return {type:'FILL_FIELD',field:match[1].trim(),value:match[2]};
  }
  if (/^(?:nex )?voltar$/.test(normalized)) return {type:'BACK'};
  if (/^(?:nex )?avancar$/.test(normalized)) return {type:'FORWARD'};
  if (/^(?:nex )?recarregar$/.test(normalized)) return {type:'RELOAD'};
  return null;
}
