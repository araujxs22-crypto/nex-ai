import {isNexAppOrigin,isSafeHttpsUrl,isSafePairingCode,validateBrowserCommand} from './protocol.js';
import {readPageOnPage,clickElementOnPage,fillFieldOnPage,historyActionOnPage} from './page-actions.js';

const STATE_KEY='nexBrowserAgentState';
const DEFAULT_STATE={authorizedTabId:null,authorizedOrigin:null,pairingCode:null,pairingExpiresAt:0,paired:false,paused:true};
let commandQueue=Promise.resolve();

async function getState(){
  const stored=await chrome.storage.local.get(STATE_KEY);
  return {...DEFAULT_STATE,...(stored[STATE_KEY]||{})};
}
async function saveState(state){
  await chrome.storage.local.set({[STATE_KEY]:state});
  return state;
}
function statusFrom(state){
  return {
    paired:Boolean(state.paired),
    paused:Boolean(state.paused),
    authorized:Boolean(Number.isInteger(state.authorizedTabId)&&state.authorizedOrigin),
    authorizedOrigin:state.authorizedOrigin||null,
    hasPendingCode:Boolean(state.pairingCode&&state.pairingExpiresAt>Date.now())
  };
}
function getPageMeta(){return {url:location.href,origin:location.origin};}

async function authorizeTab(tabId,expectedOrigin){
  if(!Number.isInteger(tabId)||tabId<0)throw new Error('Não consegui identificar a aba atual.');
  let expected;
  try{expected=new URL(expectedOrigin);}catch{throw new Error('Origem inválida.');}
  if(expected.protocol!=='https:'||expected.origin!==expectedOrigin)throw new Error('Somente páginas HTTPS podem ser autorizadas.');
  const results=await chrome.scripting.executeScript({target:{tabId},func:getPageMeta});
  const meta=results&&results[0]&&results[0].result;
  if(!meta||!isSafeHttpsUrl(meta.url)||meta.origin!==expected.origin)throw new Error('A página mudou. Abra a extensão novamente na página HTTPS que deseja autorizar.');
  const state=await getState();
  state.authorizedTabId=tabId;
  state.authorizedOrigin=expected.origin;
  state.paused=true;
  state.paired=false;
  state.pairingCode=null;
  state.pairingExpiresAt=0;
  await saveState(state);
  return statusFrom(state);
}

async function createPairingCode(){
  const state=await getState();
  if(!Number.isInteger(state.authorizedTabId)||!state.authorizedOrigin)throw new Error('Autorize primeiro a aba que deseja controlar.');
  const bytes=new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const code=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
  state.pairingCode=code;
  state.pairingExpiresAt=Date.now()+5*60*1000;
  state.paired=false;
  state.paused=true;
  await saveState(state);
  return {code,expiresInSeconds:300};
}

async function requireAuthorizedTab(state){
  if(!Number.isInteger(state.authorizedTabId)||!state.authorizedOrigin)throw new Error('Nenhuma aba autorizada. Abra a extensão na página que deseja controlar e clique em “Autorizar esta aba”.');
  const results=await chrome.scripting.executeScript({target:{tabId:state.authorizedTabId},func:getPageMeta});
  const meta=results&&results[0]&&results[0].result;
  if(!meta||!isSafeHttpsUrl(meta.url))throw new Error('A página autorizada não está mais disponível ou não usa HTTPS.');
  if(meta.origin!==state.authorizedOrigin)throw new Error('A aba mudou de site. Abra a extensão nessa página e autorize-a novamente.');
  return state.authorizedTabId;
}

async function executeBrowserCommand(rawCommand){
  const validation=validateBrowserCommand(rawCommand);
  if(!validation.ok)throw new Error(validation.error);
  let state=await getState();
  if(!state.paired)throw new Error('A extensão ainda não está pareada com o NEX.');
  if(state.paused)throw new Error('Agente pausado. Reative-o manualmente no popup da extensão.');
  const tabId=await requireAuthorizedTab(state);
  state=await getState();
  if(state.paused||!state.paired)throw new Error('A ação foi bloqueada porque o agente foi pausado.');

  const command=validation.command;
  if(command.type==='NAVIGATE'){
    const destinationOrigin=new URL(command.url).origin;
    await chrome.tabs.update(tabId,{url:command.url});
    if(destinationOrigin!==state.authorizedOrigin){
      state.authorizedOrigin=null;
      state.paused=true;
      await saveState(state);
      return {ok:true,message:'Navegação iniciada. Para controlar o novo site, abra a extensão nessa aba e autorize-a novamente.'};
    }
    return {ok:true,message:'Navegação iniciada na aba autorizada.'};
  }

  let func,args=[];
  switch(command.type){
    case 'READ_PAGE': func=readPageOnPage; break;
    case 'CLICK': func=clickElementOnPage; args=[command.target]; break;
    case 'FILL_FIELD': func=fillFieldOnPage; args=[command.field,command.value]; break;
    case 'BACK': func=historyActionOnPage; args=['back']; break;
    case 'FORWARD': func=historyActionOnPage; args=['forward']; break;
    case 'RELOAD': func=historyActionOnPage; args=['reload']; break;
    default: throw new Error('Comando não suportado.');
  }
  const results=await chrome.scripting.executeScript({target:{tabId},func,args});
  const result=results&&results[0]&&results[0].result;
  if(!result)throw new Error('A página não retornou um resultado.');
  if(command.type==='READ_PAGE'){
    return {ok:true,data:{title:String(result.title||'').slice(0,300),url:String(result.url||'').slice(0,2048),text:String(result.text||'').slice(0,20000)}};
  }
  if(result.ok===false)throw new Error(result.message||'A página recusou a ação.');
  return {ok:true,data:result};
}

function queueCommand(command){
  const result=commandQueue.then(()=>executeBrowserCommand(command),()=>executeBrowserCommand(command));
  commandQueue=result.then(()=>undefined,()=>undefined);
  return result;
}

async function handlePopupMessage(message){
  switch(message.action){
    case 'GET_STATUS': return {ok:true,data:statusFrom(await getState())};
    case 'AUTHORIZE_TAB': return {ok:true,data:await authorizeTab(message.tabId,message.expectedOrigin)};
    case 'CREATE_PAIRING_CODE': return {ok:true,data:await createPairingCode()};
    case 'KILL_SWITCH': {
      const state=await getState();
      state.paused=true;
      await saveState(state);
      return {ok:true,data:statusFrom(state),message:'Novas ações bloqueadas. Uma ação DOM que já tenha começado pode terminar.'};
    }
    case 'RESUME': {
      const state=await getState();
      if(!state.paired||!Number.isInteger(state.authorizedTabId)||!state.authorizedOrigin)throw new Error('Pareie o NEX e autorize uma aba antes de retomar.');
      state.paused=false;
      await saveState(state);
      return {ok:true,data:statusFrom(state)};
    }
    case 'DISCONNECT': {
      await saveState({...DEFAULT_STATE});
      return {ok:true,data:statusFrom(DEFAULT_STATE)};
    }
    default: throw new Error('Ação do popup não reconhecida.');
  }
}

async function handleBridgeMessage(message){
  if(typeof message.requestId!=='string'||message.requestId.length>100)throw new Error('Identificador de solicitação inválido.');
  switch(message.type){
    case 'STATUS': return {ok:true,data:statusFrom(await getState())};
    case 'PAIR': {
      const code=message.payload&&message.payload.code;
      const state=await getState();
      if(!isSafePairingCode(code)||!state.pairingCode||code!==state.pairingCode)throw new Error('Código de pareamento inválido.');
      if(state.pairingExpiresAt<Date.now()){
        state.pairingCode=null;
        state.pairingExpiresAt=0;
        await saveState(state);
        throw new Error('Código expirado. Gere outro pela extensão.');
      }
      state.pairingCode=null;
      state.pairingExpiresAt=0;
      state.paired=true;
      state.paused=false;
      await saveState(state);
      return {ok:true,data:statusFrom(state)};
    }
    case 'UNPAIR': {
      const state=await getState();
      state.paired=false;
      state.paused=true;
      state.pairingCode=null;
      state.pairingExpiresAt=0;
      await saveState(state);
      return {ok:true,data:statusFrom(state)};
    }
    case 'COMMAND': return {ok:true,data:await queueCommand(message.payload)};
    default: throw new Error('Mensagem não permitida.');
  }
}

function isPopupSender(sender){
  return sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('popup.html');
}
function isBridgeSender(sender){
  if(sender.id!==chrome.runtime.id||sender.frameId!==0||!sender.url)return false;
  return isNexAppOrigin(sender.url);
}

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  let operation;
  if(message&&message.source==='nex-popup'&&isPopupSender(sender))operation=handlePopupMessage(message);
  else if(message&&message.source==='nex-bridge'&&isBridgeSender(sender))operation=handleBridgeMessage(message);
  else{
    sendResponse({ok:false,error:'Origem da mensagem não autorizada.'});
    return false;
  }
  Promise.resolve(operation).then(sendResponse).catch(error=>sendResponse({ok:false,error:error&&error.message?error.message:'Falha inesperada.'}));
  return true;
});

chrome.tabs.onRemoved.addListener(async tabId=>{
  const state=await getState();
  if(state.authorizedTabId===tabId){
    state.authorizedTabId=null;
    state.authorizedOrigin=null;
    state.paired=false;
    state.paused=true;
    state.pairingCode=null;
    state.pairingExpiresAt=0;
    await saveState(state);
  }
});
