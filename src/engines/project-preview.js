const PREVIEW_CSP = "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

function inlineScript(source) {
  const code = String(source ?? '');
  if (/^\s*import\s/m.test(code)) throw new Error('A prévia isolada não carrega imports externos.');
  return code.replace(/^\s*export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, '')
    .replace(/<\/script/gi, '<\\/script');
}

export function buildProjectPreview(fileContents = {}) {
  if (!fileContents || typeof fileContents !== 'object' || Array.isArray(fileContents)) {
    throw new TypeError('Os arquivos do projeto precisam ser um objeto.');
  }
  let html = String(fileContents['index.html'] ?? '');
  if (!html.trim()) throw new Error('Este projeto não contém index.html para pré-visualização.');
  const styles = String(fileContents['styles.css'] ?? '');
  const script = inlineScript(fileContents['src/main.js'] ?? '');
  if (styles) {
    const styleTag = '<style>\n' + styles.replace(/<\/style/gi, '\\3C /style') + '\n</style>';
    const link = /<link\b[^>]*href=(["'])[^"']*styles\.css\1[^>]*>/i;
    if (link.test(html)) html = html.replace(link, styleTag);
    else if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, styleTag + '\n</head>');
  }
  if (script) {
    const scriptTag = '<script>\n' + script + '\n</script>';
    const entry = /<script\b[^>]*src=(["'])[^"']*src\/main\.js\1[^>]*>\s*<\/script>/i;
    if (entry.test(html)) html = html.replace(entry, scriptTag);
    else if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, scriptTag + '\n</body>');
  }
  const csp = '<meta http-equiv="Content-Security-Policy" content="' + PREVIEW_CSP + '">';
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, match => match + '\n' + csp);
  else html = '<!doctype html><html lang="pt-BR"><head>' + csp + '</head><body>' + html + '</body></html>';
  return html;
}

export const previewPolicy = PREVIEW_CSP;
