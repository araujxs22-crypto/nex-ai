const APP_ORIGIN='https://nex-ai-preview.vercel.app';
const CHANNEL='nex-browser-agent';
const pending=new Map();
let counter=0;

function request(type,payload={}){
  if(location.origin!==APP_ORIGIN)return Promise.reject(new Error('Abra o NEX pelo domínio oficial do projeto.'));
  return new Promise((resolve,reject)=>{
    const requestId='nex-'+Date.now()+'-'+(++counter);
    const timer=setTimeout(()=>{
      pending.delete(requestId);
      reject(new Error('A extensão não respondeu. Confira se está instalada e se o NEX está aberto no domínio oficial.'));
    },8000);
    pending.set(requestId,{resolve,reject,timer});
    window.postMessage({channel:CHANNEL,source:'nex-page',requestId,type,payload},APP_ORIGIN);
  });
}

window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==APP_ORIGIN)return;
  const message=event.data;
  if(!message||message.channel!==CHANNEL||message.source!=='nex-extension')return;
  const item=pending.get(message.requestId);
  if(!item)return;
  clearTimeout(item.timer);
  pending.delete(message.requestId);
  if(message.response&&message.response.ok)item.resolve(message.response.data);
  else item.reject(new Error(message.response&&message.response.error||'Falha na comunicação com a extensão.'));
});

window.nexBrowserAgent=Object.freeze({
  status:()=>request('STATUS'),
  connect:code=>request('PAIR',{code:String(code||'').trim()}),
  disconnect:()=>request('UNPAIR'),
  run:command=>request('COMMAND',command)
});

function setAgentStatus(text){
  const node=document.getElementById('nex-agent-status');
  if(node)node.textContent=text;
}
async function refreshAgentStatus(){
  try{
    const status=await window.nexBrowserAgent.status();
    if(!status.paired)setAgentStatus('Extensão detectada, mas ainda não pareada.');
    else if(status.paused)setAgentStatus('Conectada e pausada. Reative pelo popup da extensão.');
    else if(!status.authorized)setAgentStatus('Pareada, mas nenhuma aba está autorizada.');
    else setAgentStatus('Conectada e pronta. Aba autorizada: '+status.authorizedOrigin);
  }catch{
    setAgentStatus('Extensão não detectada. Instale/ative a extensão e recarregue esta página.');
  }
}
function installAgentUI(){
  const connectButton=document.getElementById('nex-agent-connect');
  const disconnectButton=document.getElementById('nex-agent-disconnect');
  const refreshButton=document.getElementById('nex-agent-refresh');
  const codeInput=document.getElementById('nex-agent-code');
  connectButton?.addEventListener('click',async()=>{
    const code=codeInput?.value.trim()||'';
    if(!code){setAgentStatus('Cole o código gerado pelo popup da extensão.');return;}
    connectButton.disabled=true;
    try{
      await window.nexBrowserAgent.connect(code);
      if(codeInput)codeInput.value='';
      setAgentStatus('Pareamento concluído. O agente está pronto.');
    }catch(error){setAgentStatus(error.message);}
    finally{connectButton.disabled=false;}
  });
  disconnectButton?.addEventListener('click',async()=>{
    try{await window.nexBrowserAgent.disconnect();setAgentStatus('Extensão desconectada.');}
    catch(error){setAgentStatus(error.message);}
  });
  refreshButton?.addEventListener('click',refreshAgentStatus);
  refreshAgentStatus();
}
installAgentUI();
