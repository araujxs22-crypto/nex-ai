const SALA_HOST = 'saladofuturo.educacao.sp.gov.br';

export function isSalaDoFuturoUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname.toLowerCase() === SALA_HOST
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export function isTrustedNexOrigin(value, additionalOrigins = []) {
  if (typeof value !== 'string' || !value) return false;
  if (additionalOrigins.includes(value)) return true;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();

    return host === 'nex-ai-preview.vercel.app'
      || /^nex-ai-preview-[a-z0-9-]+\.vercel\.app$/.test(host);
  } catch {
    return false;
  }
}
