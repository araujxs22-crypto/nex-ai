const APP_ORIGIN='https://nex-ai-preview-git-feat-nex-browser-agent-araujxs22-8685.vercel.app';
const CHANNEL='nex-browser-agent';
const pending=new Map();
let counter=0;

function request(type,payload={},timeoutMs=8000){
  if(location.origin!==APP_ORIGIN)return Promise.reject(new Error('Abra o NEX pelo domínio oficial do projeto.'));
  return new Promise((resolve,reject)=>{
    const requestId='nex-'+Date.now()+'-'+(++counter);
    const timer=setTimeout(()=>{
      pending.delete(requestId);
      reject(new Error('A extensão não respondeu. Confira se está instalada e se o NEX está aberto no domínio oficial.'));
    },timeoutMs);
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
  run:command=>request('COMMAND',command),
  localSetup:token=>request('LOCAL_SETUP',{token:String(token||'').trim()},15000),
  localStatus:()=>request('LOCAL_STATUS',{},15000),
  localCommand:(action,args={})=>request('LOCAL_COMMAND',{action,...args},75000)
});
window.nexCodingAgent=Object.freeze({
  status:()=>window.nexBrowserAgent.localStatus(),
  run:command=>window.nexBrowserAgent.localCommand(command.type,command),
  saveScaffold:project=>{
    const files=Object.entries(project?.fileContents||{}).map(([file,content])=>({path:file,content:String(content)}));
    if(!files.length)throw new Error('O projeto não contém arquivos para gravar.');
    return window.nexBrowserAgent.localCommand('scaffold',{files});
  }
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
  const localConnect=document.getElementById('nex-local-agent-connect');
  const localRefresh=document.getElementById('nex-local-agent-refresh');
  const localToken=document.getElementById('nex-local-agent-token');
  const localStatus=document.getElementById('nex-local-agent-status');
  const showLocalStatus=value=>{if(localStatus)localStatus.textContent=value;};
  localConnect?.addEventListener('click',async()=>{
    const token=localToken?.value.trim()||'';
    if(!token){showLocalStatus('Cole o token exibido no terminal do agente local.');return;}
    localConnect.disabled=true;
    try{
      const result=await window.nexBrowserAgent.localSetup(token);
      if(localToken)localToken.value='';
      showLocalStatus('Conectado. Workspace: '+result.workspace);
    }catch(error){showLocalStatus(error.message);}
    finally{localConnect.disabled=false;}
  });
  localRefresh?.addEventListener('click',async()=>{
    try{const result=await window.nexCodingAgent.status();showLocalStatus('Agente ativo. Workspace: '+result.workspace);}
    catch(error){showLocalStatus(error.message);}
  });
  localRefresh?.click();
  refreshAgentStatus();
}
installAgentUI();
