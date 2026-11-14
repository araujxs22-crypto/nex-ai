function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

export function parseNexCodingCommand(input) {
  const text=String(input||'').trim();
  let match;
  if ((match=/^(?:listar|liste|mostre)(?: os)? arquivos(?: em (.+))?$/i.exec(normalize(text)))) {
    return {type:'list',path:match[1]?.trim()||'.'};
  }
  if ((match=/^(?:ler|leia|abra) arquivo\s+(.+)$/i.exec(text))) return {type:'read',path:match[1].trim()};
  if ((match=/^(?:criar|crie) arquivo\s+(.+?)\s+com conte[uú]do:\s*([\s\S]+)$/i.exec(text))) {
    return {type:'create',path:match[1].trim(),content:match[2]};
  }
  if ((match=/^(?:editar|edite|escrever|escreva|salvar|salve) arquivo\s+(.+?)\s+com conte[uú]do:\s*([\s\S]+)$/i.exec(text))) {
    return {type:'write',path:match[1].trim(),content:match[2]};
  }
  if ((match=/^(?:executar|execute|rodar|rode)\s+(npm test|npm run [a-zA-Z0-9:_-]+|node [^\s]+|python [^\s]+)$/i.exec(text))) {
    return {type:'run',command:match[1]};
  }
  return null;
}
