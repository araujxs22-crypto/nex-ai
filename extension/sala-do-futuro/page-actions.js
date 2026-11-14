export function readPageOnPage() {
  const text = document.body?.innerText || '';
  return {
    title: document.title || 'Página sem título',
    url: location.href,
    text: text.slice(0, 20000)
  };
}

export function clickElementOnPage(needle) {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const wanted = normalize(needle);
  if (!wanted) return {ok:false, message:'Digite o texto do link ou botão.'};

  const candidates = Array.from(document.querySelectorAll('a[href],button,input[type="button"],[role="button"]'));
  const visible = candidates.filter(element => {
    const tag = String(element.tagName || '').toLowerCase();
    const type = String(element.type || '').toLowerCase();
    if (element.disabled || normalize(element.getAttribute?.('aria-disabled')) === 'true') return false;
    if (type === 'submit' || type === 'reset' || type === 'image') return false;
    if (tag === 'button' && type !== 'button') return false;
    if (tag === 'input' && type !== 'button') return false;
    if (tag !== 'a' && element.closest?.('form')) return false;
    if (tag === 'a') {
      const href = String(element.getAttribute?.('href') || '');
      if (!href || /^\s*(javascript:|mailto:|tel:|data:)/i.test(href)) return false;
      if (element.hasAttribute?.('download') || String(element.target || '').toLowerCase() === '_blank') return false;
      try {
        const destination = new URL(href,'https://nex.invalid/');
        if (destination.protocol !== 'https:' || destination.username || destination.password) return false;
      } catch { return false; }
    }
    const rect = element.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  });

  const textOf = element => element.getAttribute?.('aria-label')
    || element.innerText
    || element.textContent
    || element.value
    || element.title
    || '';
  const exact = visible.filter(element => normalize(textOf(element)) === wanted);
  const matches = exact.length ? exact : visible.filter(element => normalize(textOf(element)).includes(wanted));
  if (matches.length === 0) return {ok:false, message:'Não encontrei um link ou botão visível com esse texto.'};
  if (matches.length > 1) {
    const names = matches.slice(0, 4).map(textOf).filter(Boolean).join(' · ');
    return {ok:false, message:'Encontrei mais de um elemento. Use um texto mais específico: ' + names};
  }

  const found = matches[0];
  found.click();
  return {ok:true, message:'Clique executado em: ' + String(textOf(found)).trim()};
}

export function fillFieldOnPage(needle, text) {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const wanted = normalize(needle);
  const typedText = String(text ?? '');
  if (!wanted) return {ok:false, message:'Informe o nome, rótulo ou placeholder do campo.'};

  const selector = 'input:not([type]),input[type="text"],input[type="search"],input[type="email"],input[type="url"],input[type="tel"],input[type="number"],input[type="date"],input[type="time"],input[type="datetime-local"],input[type="month"],input[type="week"],textarea,select,[contenteditable="true"]';
  const candidates = Array.from(document.querySelectorAll(selector));
  const usable = candidates.filter(element => {
    const tag = String(element.tagName || '').toLowerCase();
    const type = String(element.type || '').toLowerCase();
    const allowedTypes = ['', 'text', 'search', 'email', 'url', 'tel', 'number', 'date', 'time', 'datetime-local', 'month', 'week'];
    if (tag === 'input' && !allowedTypes.includes(type)) return false;
    if (element.disabled || element.readOnly) return false;
    const autocomplete = normalize(element.getAttribute?.('autocomplete'));
    const sensitiveAutocomplete = ['current-password','new-password','one-time-code','cc-number','cc-csc','cc-exp','cc-exp-month','cc-exp-year'];
    if (sensitiveAutocomplete.includes(autocomplete)) return false;
    const sensitiveHint = normalize([element.name,element.id,element.placeholder,element.getAttribute?.('aria-label'),autocomplete].join(' ')).replace(/[._-]/g,' ');
    if (/\b(password|passwd|passcode|senha|token|otp|one time|verification|verificacao|cvv|cvc|credit card|cartao|card number)\b/i.test(sensitiveHint)) return false;
    const rect = element.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  });

  const describe = element => {
    const labels = Array.from(element.labels || []).map(label => label.innerText || label.textContent || '');
    return [
      element.name,
      element.id,
      element.placeholder,
      element.getAttribute?.('aria-label'),
      ...labels
    ].map(value => String(value || '').trim()).filter(Boolean);
  };
  const exact = usable.filter(element => describe(element).some(value => normalize(value) === wanted));
  const matches = exact.length ? exact : usable.filter(element => normalize(describe(element).join(' ')).includes(wanted));
  if (matches.length === 0) return {ok:false, message:'Não encontrei esse campo visível e editável. Campos de senha e códigos de verificação são ignorados.'};
  if (matches.length > 1) return {ok:false, message:'Encontrei vários campos com esse nome. Informe um rótulo ou placeholder mais específico.'};

  const found = matches[0];
  const tag = String(found.tagName || '').toLowerCase();
  found.focus?.();

  if (tag === 'select') {
    const options = Array.from(found.options || []).filter(option => !option.disabled);
    const exactOptions = options.filter(option => [option.label, option.textContent, option.value].some(value => normalize(value) === normalize(typedText)));
    const optionMatches = exactOptions.length ? exactOptions : options.filter(option => [option.label, option.textContent, option.value].some(value => normalize(value).includes(normalize(typedText))));
    if (optionMatches.length !== 1) {
      return {ok:false, message:optionMatches.length ? 'Há mais de uma opção parecida. Informe o texto exato da opção.' : 'Não encontrei essa opção na lista.'};
    }
    found.value = optionMatches[0].value;
  } else if (found.isContentEditable || found.getAttribute?.('contenteditable') === 'true') {
    found.textContent = typedText;
    const inputEvent = typeof InputEvent === 'function'
      ? new InputEvent('input', {bubbles:true, inputType:'insertText', data:typedText})
      : new Event('input', {bubbles:true});
    found.dispatchEvent(inputEvent);
    return {ok:true, message:'Texto digitado no campo. Nada foi enviado.'};
  } else {
    let prototype = Object.getPrototypeOf(found);
    let valueSetter = null;
    while (prototype && !valueSetter) {
      valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set || null;
      prototype = Object.getPrototypeOf(prototype);
    }
    if (valueSetter) valueSetter.call(found, typedText);
    else found.value = typedText;
  }

  found.dispatchEvent(new Event('input', {bubbles:true}));
  found.dispatchEvent(new Event('change', {bubbles:true}));
  return {ok:true, message:tag === 'select' ? 'Opção selecionada. Nada foi enviado.' : 'Campo preenchido. Nada foi enviado.'};
}

export function historyActionOnPage(action) {
  if (action === 'back') history.back();
  else if (action === 'forward') history.forward();
  else if (action === 'reload') location.reload();
  else return {ok:false, message:'Ação de navegação desconhecida.'};
  return {ok:true, message:'Comando de navegação executado.'};
}
