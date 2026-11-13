import {isSalaDoFuturoUrl} from './policy.js';

const readButton = document.getElementById('read');
const copyButton = document.getElementById('copy');
const status = document.getElementById('status');
const preview = document.getElementById('preview');

let pageText = '';

function setStatus(message) {
  status.textContent = message;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab?.id || !tab.url) throw new Error('Não consegui identificar a aba atual.');
  if (!isSalaDoFuturoUrl(tab.url)) {
    throw new Error('Abra primeiro https://saladofuturo.educacao.sp.gov.br/ e entre na sua conta.');
  }
  return tab;
}

readButton.addEventListener('click', async () => {
  readButton.disabled = true;
  copyButton.disabled = true;
  pageText = '';
  preview.value = '';
  setStatus('Lendo o texto visível da atividade…');

  try {
    const tab = await getActiveTab();
    const [result] = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => ({
        title: document.title || 'Sala do Futuro',
        url: location.href,
        text: document.body?.innerText || ''
      })
    });

    const data = result?.result;
    const extracted = String(data?.text || '').trim();
    if (!extracted) throw new Error('Não encontrei texto visível. Aguarde a atividade carregar e tente novamente.');

    pageText = [
      data.title || 'Sala do Futuro',
      data.url || tab.url,
      '',
      extracted.slice(0, 14000)
    ].join('\n');

    preview.value = pageText;
    copyButton.disabled = false;
    setStatus('Texto lido. Clique em “Copiar texto para o NEX”.');
  } catch (error) {
    setStatus(error?.message || 'Não foi possível ler esta página.');
  } finally {
    readButton.disabled = false;
  }
});

copyButton.addEventListener('click', async () => {
  if (!pageText) return;
  try {
    await navigator.clipboard.writeText(pageText);
    setStatus('Copiado. Volte ao NEX, clique na conversa e cole com Ctrl+V.');
  } catch {
    setStatus('A cópia automática foi bloqueada. Selecione o texto e copie manualmente.');
  }
});
