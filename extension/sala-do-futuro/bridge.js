(() => {
  'use strict';
  const APP_ORIGIN='https://nex-ai-preview-git-feat-nex-browser-agent-araujxs22-8685.vercel.app';
  const CHANNEL='nex-browser-agent';
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==APP_ORIGIN)return;
    const message=event.data;
    if(!message||message.channel!==CHANNEL||message.source!=='nex-page')return;
    if(typeof message.requestId!=='string'||message.requestId.length>100)return;
    if(!['STATUS','PAIR','UNPAIR','COMMAND','LOCAL_SETUP','LOCAL_STATUS','LOCAL_COMMAND'].includes(message.type))return;
    try{
      chrome.runtime.sendMessage({source:'nex-bridge',requestId:message.requestId,type:message.type,payload:message.payload||{}},response=>{
        const runtimeError=chrome.runtime.lastError;
        const safeResponse=runtimeError?{ok:false,error:runtimeError.message}:(response||{ok:false,error:'A extensão não retornou resposta.'});
        window.postMessage({channel:CHANNEL,source:'nex-extension',requestId:message.requestId,response:safeResponse},APP_ORIGIN);
      });
    }catch{
      window.postMessage({channel:CHANNEL,source:'nex-extension',requestId:message.requestId,response:{ok:false,error:'Não foi possível falar com a extensão.'}},APP_ORIGIN);
    }
  });
})();
