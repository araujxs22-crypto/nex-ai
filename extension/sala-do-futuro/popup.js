import {isSupportedPageUrl} from './policy.js';
import {clickElementOnPage, fillFieldOnPage, historyActionOnPage, readPageOnPage} from './page-actions.js';

const $ = id => document.getElementById(id);
const status = $('status');
let pageText = '';
function report(message) { status.textContent = message; }

async function selectedTab() {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id || !tab.url) throw new Error('Não consegui identificar a aba atual.');
  return tab;
}

async function activeTab() {
  const tab = await selectedTab();
  if (!isSupportedPageUrl(tab.url)) throw new Error('Por segurança, o NEX só atua em páginas HTTPS.');
  return tab;
}

async function runOnPage(func, args = []) {
  const tab = await activeTab();
  const results = await chrome.scripting.executeScript({target:{tabId:tab.id},func,args});
  return results?.[0]?.result;
}

async function navigateTo(url) {
  const tab = await selectedTab();
  await chrome.tabs.update(tab.id, {url});
}

$('googleSearch').addEventListener('click', async () => {
  const query = $('googleQuery').value.trim();
  if (!query) return report('Digite o que deseja pesquisar.');
  try {
    await navigateTo('https://www.google.com/search?q=' + encodeURIComponent(query));
    report('Pesquisa aberta no Google. Depois que carregar, abra novamente a extensão para ler os resultados.');
  } catch(error) { report(error.message || 'Não foi possível pesquisar no Google.'); }
});

$('navigate').addEventListener('click', async () => {
  try {
    let raw = $('url').value.trim();
    if (!raw) throw new Error('Digite um endereço para abrir.');
    if (!/^[a-z][a-z0-9+.-]*:\\/\\//i.test(raw)) raw = 'https://' + raw;
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use um endereço HTTPS válido, sem usuário ou senha.');
    await navigateTo(url.href);
    report('Endereço aberto. Quando carregar, abra novamente a extensão para continuar.');
  } catch(error) { report(error.message || 'Não foi possível abrir o endereço.'); }
});

for (const [id, action, label] of [
  ['back','back','Voltando'],
  ['forward','forward','Avançando'],
  ['reload','reload','Recarregando']
]) {
  $(id).addEventListener('click', async () => {
    try {
      await runOnPage(historyActionOnPage, [action]);
      report(label + ' a página. Abra novamente a extensão quando terminar.');
    } catch(error) { report(error.message || 'Não foi possível navegar nesta página.'); }
  });
}

$('read').addEventListener('click', async () => {
  try {
    report('Lendo o conteúdo visível…');
    const data = await runOnPage(readPageOnPage);
    const extracted = String(data?.text || '').trim();
    if (!extracted) throw new Error('Não encontrei texto visível nesta página.');
    pageText = [data.title || 'Página', data.url || '', '', extracted].join('\\n');
    $('preview').value = pageText;
    $('copy').disabled = false;
    report('Página lida. Você pode copiar o conteúdo para o NEX.');
  } catch(error) { report(error.message || 'Falha ao ler a página.'); }
});

$('click').addEventListener('click', async () => {
  const target = $('target').value.trim();
  if (!target) return report('Digite o texto visível do botão ou link.');
  try {
    const result = await runOnPage(clickElementOnPage, [target]);
    report(result?.message || 'A ação foi concluída.');
  } catch(error) { report(error.message || 'Não foi possível clicar.'); }
});

$('type').addEventListener('click', async () => {
  const label = $('field').value.trim();
  const value = $('value').value;
  if (!label) return report('Informe o nome, rótulo ou placeholder do campo.');
  try {
    const result = await runOnPage(fillFieldOnPage, [label, value]);
    report(result?.message || 'A ação foi concluída.');
  } catch(error) { report(error.message || 'Não foi possível preencher o campo.'); }
});

$('copy').addEventListener('click', async () => {
  if (!pageText) return;
  try {
    await navigator.clipboard.writeText(pageText);
    report('Texto copiado. Cole na conversa do NEX com Ctrl+V.');
  } catch {
    report('Cópia bloqueada pelo navegador. Selecione o texto e copie manualmente.');
  }
});

$('clear').addEventListener('click', () => {
  $('preview').value = '';
  pageText = '';
  $('copy').disabled = true;
  report('Conteúdo limpo.');
});
