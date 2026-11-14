function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
}

function cleanPath(value) {
  return String(value || '').trim().replace(/^(?:["'“”])|(?:["'“”])$/g,'').trim();
}

export function parseNexCodingCommand(input) {
  const text=String(input||'').trim();
  const normalized=normalize(text);
  let match;

  // File listing: accept direct commands and common natural-language variants.
  if ((match=/^(?:(?:listar|liste|mostre|mostrar|exibir|exiba)(?: os)? arquivos|quais arquivos existem)(?: (?:em|de|da pasta) (.+))?$/.exec(normalized))) {
    return {type:'list',path:cleanPath(match[1])||'.'};
  }

  if ((match=/^(?:ler|leia|abra|abrir|mostrar|mostre|exibir|exiba) (?:o )?arquivo\s+(.+)$/i.exec(text))) {
    return {type:'read',path:cleanPath(match[1])};
  }

  if ((match=/^(?:criar|crie) (?:o )?arquivo\s+(.+?)\s+(?:com conte[uú]do:|contendo:)\s*([\s\S]+)$/i.exec(text))) {
    return {type:'create',path:cleanPath(match[1]),content:match[2]};
  }

  if ((match=/^(?:editar|edite|escrever|escreva|salvar|salve|atualizar|atualize) (?:o )?arquivo\s+(.+?)\s+(?:com conte[uú]do:|para:)\s*([\s\S]+)$/i.exec(text))) {
    return {type:'write',path:cleanPath(match[1]),content:match[2]};
  }

  if ((match=/^(?:executar|execute|rodar|rode|testar|teste)\s+(npm test|npm run [a-zA-Z0-9:_-]+|node [^\s]+|python [^\s]+)$/i.exec(text))) {
    return {type:'run',command:match[1]};
  }

  return null;
}
