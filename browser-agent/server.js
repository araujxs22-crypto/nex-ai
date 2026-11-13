import {createServer} from 'node:http';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {isSalaDoFuturoUrl, isTrustedNexOrigin} from './policy.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(HERE, '.nex-profile');
const SALA_URL = 'https://saladofuturo.educacao.sp.gov.br/';
const HOST = '127.0.0.1';
const PORT = Number(process.env.NEX_BROWSER_PORT || 4317);
const TOKEN = process.env.NEX_BROWSER_TOKEN || randomBytes(24).toString('hex');
const EXTRA_ORIGINS = (process.env.NEX_ALLOWED_ORIGINS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

let context = null;

mkdirSync(PROFILE_DIR, {recursive: true});

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function tokenMatches(candidate) {
  if (typeof candidate !== 'string') return false;
  const left = Buffer.from(TOKEN);
  const right = Buffer.from(candidate);
  return left.length === right.length && timingSafeEqual(left, right);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!isTrustedNexOrigin(origin, EXTRA_ORIGINS)) {
    throw Object.assign(new Error('Origem do NEX não autorizada.'), {status: 403});
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-NEX-Token');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Cache-Control', 'no-store');

  const expectedHosts = new Set([HOST + ':' + PORT, 'localhost:' + PORT]);
  if (!expectedHosts.has(String(req.headers.host || '').toLowerCase())) {
    throw Object.assign(new Error('Cabeçalho Host inválido.'), {status: 403});
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 8192) {
        reject(Object.assign(new Error('Requisição muito grande.'), {status: 413}));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('JSON inválido.'), {status: 400}));
      }
    });
    req.on('error', reject);
  });
}

async function ensureBrowser() {
  if (context) {
    try {
      context.pages();
      return context;
    } catch {
      context = null;
    }
  }

  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
    locale: 'pt-BR',
    args: ['--start-maximized']
  });
  return context;
}

function activePage() {
  if (!context) return null;
  try {
    const pages = context.pages().filter(page => !page.isClosed());
    return pages.at(-1) || null;
  } catch {
    context = null;
    return null;
  }
}

async function openSala() {
  if (!isSalaDoFuturoUrl(SALA_URL)) throw new Error('Endereço oficial bloqueado pela política local.');
  const browserContext = await ensureBrowser();
  const page = activePage() || await browserContext.newPage();

  await page.goto(SALA_URL, {waitUntil: 'domcontentloaded', timeout: 45000});
  await page.bringToFront();

  return {
    browserOpen: true,
    title: await page.title().catch(() => 'Sala do Futuro'),
    url: page.url()
  };
}

async function readSalaPage() {
  const page = activePage();
  if (!page) throw new Error('Abra primeiro a Sala do Futuro.');
  if (!isSalaDoFuturoUrl(page.url())) {
    throw new Error('Por segurança, a leitura está limitada ao domínio oficial da Sala do Futuro. Volte à página da plataforma.');
  }

  const result = await page.evaluate(() => ({
    title: document.title || 'Sala do Futuro',
    text: document.body?.innerText || ''
  }));

  const text = String(result.text).trim().slice(0, 16000);
  if (!text) throw new Error('A página ainda não tem texto visível. Aguarde carregar e tente novamente.');

  return {title: result.title, url: page.url(), text};
}

async function closeBrowser() {
  const current = context;
  context = null;
  if (current) await current.close();
  return {browserOpen: false};
}

const server = createServer(async (req, res) => {
  try {
    applyCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!tokenMatches(req.headers['x-nex-token'])) {
      json(res, 401, {error: 'Código de conexão inválido. Confira o código exibido no terminal.'});
      return;
    }

    if (req.method === 'GET' && req.url === '/api/status') {
      const page = activePage();
      json(res, 200, {
        ok: true,
        browserOpen: Boolean(page),
        currentUrl: page?.url() || ''
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/open') {
      const result = await openSala();
      json(res, 200, result);
      return;
    }

    if (req.method === 'POST' && req.url === '/api/read') {
      await readJson(req);
      const result = await readSalaPage();
      json(res, 200, result);
      return;
    }

    if (req.method === 'POST' && req.url === '/api/close') {
      await readJson(req);
      const result = await closeBrowser();
      json(res, 200, result);
      return;
    }

    json(res, 404, {error: 'Rota não encontrada.'});
  } catch (error) {
    const status = Number(error.status) || 500;
    const message = status === 500 && /Executable doesn't exist|browserType\.launchPersistentContext/i.test(error.message)
      ? 'O Chromium do Playwright não foi instalado. Execute install.bat novamente.'
      : (error.message || 'Erro interno no agente local.');
    json(res, status, {error: message});
  }
});

server.listen(PORT, HOST, () => {
  console.log('\nNEX — AGENTE LOCAL PLAYWRIGHT');
  console.log('Servidor: http://' + HOST + ':' + PORT);
  console.log('Sessão: perfil persistente salvo apenas neste computador.');
  console.log('Código de conexão (cole no painel Sala do Futuro do NEX):');
  console.log(TOKEN);
  console.log('\nDeixe esta janela aberta enquanto usar a automação. Pressione Ctrl+C para encerrar.\n');
});

async function shutdown() {
  try {
    await closeBrowser();
  } catch {}
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
