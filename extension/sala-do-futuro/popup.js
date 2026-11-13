import {isSupportedPageUrl} from './policy.js';

const $ = id => document.getElementById(id);
const status = $('status');
let pageText = '';
function report(message) { status.textContent = message; }

async function activeTab() {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id || !tab.url) throw new Error('Não consegui identificar a aba atual.');
  if (!isSupportedPageUrl(tab.url)) throw new Error('Por segurança, o NEX só atua em páginas HTTPS.');
  return tab;
}
async function runOnPage(func, args = []) {
  const tab = await activeTab();
  const results = await chrome.scripting.executeScript({target:{tabId:tab.id},func,args});
  return results?.[0]?.result;
}

$('navigate').addEventListener('click', async () => {
  try {
    const raw = $('url').value.trim();
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use um endereço HTTPS válido, sem usuário ou senha.');
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    await chrome.tabs.update(tab.id,{url:url.href});
    report('Endereço aberto. Depois que carregar, clique novamente na extensão para ler ou interagir.');
  } catch(error) { report(error.message || 'Não foi possível abrir o endereço.'); }
});

$('read').addEventListener('click', async () => {
  try {
    report('Lendo o conteúdo visível…');
    const data = await runOnPage(() => ({title:document.title,url:location.href,text:document.body?.innerText || ''}));
    pageText = [data.title,data.url,'',String(data.text).slice(0,20000)].join('\n');
    if (!data.text.trim()) throw new Error('Não encontrei texto visível nesta página.');
    $('preview').value = pageText;
    $('copy').disabled = false;
    report('Página lida. Você pode copiar o texto para o NEX.');
  } catch(error) { report(error.message || 'Falha ao ler a página.'); }
});

$('click').addEventListener('click', async () => {
  const target = $('target').value.trim();
  if (!target) return report('Digite o texto visível do botão ou link.');
  try {
    const result = await runOnPage((needle) => {
      const norm = value => String(value || '').replace(/\s+/g,' ').trim().toLocaleLowerCase();
      const wanted = norm(needle);
      const candidates = [...document.querySelectorAll('a,[role="button"],button[type="button"],input[type="button"]')].filter(el => !(el instanceof HTMLButtonElement) || !el.form);
      const found = candidates.find(el => {
        const text = norm(el.innerText || el.value || el.getAttribute('aria-label') || el.title);
        const rect = el.getBoundingClientRect();
        return text.includes(wanted) && rect.width > 0 && rect.height > 0 && !el.disabled;
      });
      if (!found) return {ok:false,message:'Não encontrei um botão ou link visível com esse texto.'};
      found.click();
      return {ok:true,message:'Clique executado em: ' + (found.innerText || found.value || found.getAttribute('aria-label') || needle)};
    },[target]);
    report(result.message);
  } catch(error) { report(error.message || 'Não foi possível clicar.'); }
});

$('type').addEventListener('click', async () => {
  const label = $('field').value.trim();
  const value = $('value').value;
  if (!label) return report('Informe o nome, rótulo ou placeholder do campo.');
  try {
    const result = await runOnPage((needle,text) => {
      const norm = value => String(value || '').replace(/\s+/g,' ').trim().toLocaleLowerCase();
      const wanted = norm(needle);
      const fields = [...document.querySelectorAll('input:not([type="password"]):not([type="hidden"]),textarea,[contenteditable="true"]')];
      const found = fields.find(el => {
        const meta = [el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.getAttribute('autocomplete')].join(' ');
        const labelText = el.labels ? [...el.labels].map(x=>x.innerText).join(' ') : '';
        const rect = el.getBoundingClientRect();
        return norm(meta + ' ' + labelText).includes(wanted) && rect.width > 0 && rect.height > 0 && !el.disabled && !el.readOnly;
      });
      if (!found) return {ok:false,message:'Não encontrei esse campo visível e editável.'};
      found.focus();
      if (found.isContentEditable) found.textContent = text;
      else {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(found),'value')?.set;
        if (setter) setter.call(found,text); else found.value = text;
      }
      found.dispatchEvent(new Event('input',{bubbles:true}));
      found.dispatchEvent(new Event('change',{bubbles:true}));
      return {ok:true,message:'Campo preenchido. Nada foi enviado.'};
    },[label,value]);
    report(result.message);
  } catch(error) { report(error.message || 'Não foi possível preencher o campo.'); }
});

$('copy').addEventListener('click',async()=>{
  if(!pageText)return;
  try{await navigator.clipboard.writeText(pageText);report('Texto copiado. Cole na conversa do NEX com Ctrl+V.');}
  catch{report('Cópia bloqueada pelo navegador. Selecione o texto e copie manualmente.');}
});
$('clear').addEventListener('click',()=>{$('preview').value='';pageText='';$('copy').disabled=true;report('Conteúdo limpo.');});
