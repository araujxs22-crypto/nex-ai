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
