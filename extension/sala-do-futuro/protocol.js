export const NEX_APP_ORIGIN = 'https://nex-ai-preview-git-feat-nex-browser-agent-araujxs22-8685.vercel.app';

export function isNexAppOrigin(value) {
  try { return new URL(value).origin === NEX_APP_ORIGIN; }
  catch { return false; }
}

export function isSafeHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

export function isSafePairingCode(value) {
  return typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value);
}

export function validateBrowserCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {ok:false,error:'Comando inválido.'};
  switch (input.type) {
    case 'READ_PAGE':
    case 'BACK':
    case 'FORWARD':
    case 'RELOAD':
      return {ok:true,command:{type:input.type}};
    case 'NAVIGATE':
      if (!isSafeHttpsUrl(input.url)) return {ok:false,error:'A navegação aceita somente URLs HTTPS válidas, sem usuário ou senha.'};
      return {ok:true,command:{type:'NAVIGATE',url:new URL(input.url).href}};
    case 'CLICK': {
      const target = typeof input.target === 'string' ? input.target.trim() : '';
      if (!target || target.length > 200) return {ok:false,error:'Informe o texto do link ou botão (até 200 caracteres).'};
      return {ok:true,command:{type:'CLICK',target}};
    }
    case 'HOVER': {
      const target = typeof input.target === 'string' ? input.target.trim() : '';
      if (!target || target.length > 200) return {ok:false,error:'Informe o texto do cartão ou elemento (até 200 caracteres).'};
      return {ok:true,command:{type:'HOVER',target}};
    }
    case 'SELECT_OPTION': {
      const option = typeof input.option === 'string' ? input.option.trim() : '';
      const question = typeof input.question === 'string' ? input.question.trim() : '';
      if (!option || option.length > 160 || question.length > 80) {
        return {ok:false,error:'Informe a opção e, quando necessário, a questão (limites: 160 e 80 caracteres).'};
      }
      return {ok:true,command:{type:'SELECT_OPTION',option,question}};
    }
    case 'FILL_FIELD': {
      const field = typeof input.field === 'string' ? input.field.trim() : '';
      const value = typeof input.value === 'string' ? input.value : '';
      if (!field || field.length > 160 || value.length > 2000) return {ok:false,error:'Campo ou texto inválido; confira os limites de tamanho.'};
      if (/\b(password|passwd|passcode|senha|token|otp|one.?time|verification|verificacao|cvv|cvc|credit.?card|cartao|card.?number)\b/i.test(field)) {
        return {ok:false,error:'Campos de senha, autenticação e pagamento são bloqueados.'};
      }
      return {ok:true,command:{type:'FILL_FIELD',field,value}};
    }
    default:
      return {ok:false,error:'Tipo de comando não permitido.'};
  }
}
