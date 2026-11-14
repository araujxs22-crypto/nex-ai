export function readPageOnPage() {
  const text = document.body?.innerText || '';
  const isVisible = element => {
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0 || element.hidden) return false;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
    return !style || (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0');
  };
  const controls = Array.from(document.querySelectorAll(
    'a[href],button,input,textarea,select,[role="button"],[role="link"],[role="radio"],[role="checkbox"]'
  )).filter(element => {
    const tag = String(element.tagName || '').toLowerCase();
    const type = String(element.type || '').toLowerCase();
    if (tag === 'input' && ['password','hidden','file','image','submit','reset'].includes(type)) return false;
    if (!isVisible(element) || element.disabled || String(element.getAttribute?.('aria-disabled')) === 'true') return false;
    const hint = [element.name,element.id,element.placeholder,element.getAttribute?.('aria-label'),element.getAttribute?.('autocomplete')]
      .join(' ').normalize('NFD').replace(/[\\u0300-\\u036f]/g,' ').toLowerCase();
    return !/password|passwd|senha|token|one.?time|otp|verification|cvv|cvc|credit.?card|cartao/i.test(hint);
  }).slice(0,80).map(element => {
    const tag = String(element.tagName || '').toLowerCase();
    const labels = Array.from(element.labels || []).map(label => label.innerText || label.textContent || '');
    const label = element.getAttribute?.('aria-label')
      || element.getAttribute?.('title')
      || labels.join(' ')
      || element.closest?.('label')?.innerText
      || element.innerText
      || element.textContent
      || element.placeholder
      || '';
    const type = String(element.type || element.getAttribute?.('role') || tag).toLowerCase();
    const options = tag === 'select'
      ? Array.from(element.options || []).slice(0,30).map(option => String(option.label || option.textContent || '').trim()).filter(Boolean)
      : undefined;
    return {
      tag, type,
      label: String(label).replace(/\\s+/g,' ').trim().slice(0,180),
      checked: typeof element.checked === 'boolean' ? element.checked : undefined,
      selected: tag === 'select' ? String(element.selectedOptions?.[0]?.label || '') : undefined,
      options,
      disabled: Boolean(element.disabled),
      required: Boolean(element.required)
    };
  }).filter(item => item.label);
  return {
    title: document.title || 'Página sem título',
    url: location.href,
    text: text.slice(0, 20000),
    controls
  };
}


export async function hoverElementOnPage(needle) {
  const normalize = value => String(value || '').normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase();
  const wanted = normalize(needle);
  if (!wanted) return {ok:false,message:'Informe o texto do cartão ou elemento para posicionar o mouse.'};

  // Hover targets may be ordinary containers with no role, tabindex or pointer cursor.
  // Match visible text first, then choose the deepest unique matching element.
  const candidates = Array.from(document.querySelectorAll(
    'a[href],button,[role],[onclick],[tabindex],section,article,li,div,span,p,h1,h2,h3,h4'
  ));
  const visible = candidates.filter(element => {
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    if (element.hidden || element.disabled || normalize(element.getAttribute?.('aria-hidden')) === 'true') return false;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
    const label = element.getAttribute?.('aria-label') || element.innerText || element.textContent || element.title || '';
    return normalize(label).includes(wanted);
  });

  const textOf = element => element.getAttribute?.('aria-label') ||
    element.innerText || element.textContent || element.title || '';
  const exact = visible.filter(element => normalize(textOf(element)) === wanted);
  let matches = exact.length ? exact : visible;
  matches = matches.filter(element =>
    !matches.some(other => other !== element && element.contains?.(other))
  );
  if (!matches.length) return {ok:false,message:'Não encontrei um elemento visível com esse texto.'};
  if (matches.length > 1) {
    return {ok:false,message:'Encontrei mais de um elemento com esse texto. Informe um trecho mais específico.'};
  }

  const found = matches[0];
  found.scrollIntoView?.({behavior:'auto',block:'center',inline:'nearest'});
  const rect = found.getBoundingClientRect();
  const clientX = Math.round(rect.left + rect.width / 2);
  const clientY = Math.round(rect.top + rect.height / 2);
  const pointerInit = {
    bubbles:true,cancelable:true,composed:true,pointerId:1,pointerType:'mouse',
    isPrimary:true,clientX,clientY,button:0,buttons:0
  };
  const mouseInit = {bubbles:true,cancelable:true,composed:true,clientX,clientY,button:0,buttons:0};
  const dispatch = (type, init, isPointer=false) => {
    let event;
    if (isPointer && typeof PointerEvent === 'function') event = new PointerEvent(type,init);
    else if (!isPointer && typeof MouseEvent === 'function') event = new MouseEvent(type,init);
    else event = new Event(type,{bubbles:init.bubbles,cancelable:init.cancelable});
    found.dispatchEvent(event);
  };
  dispatch('pointerover',pointerInit,true);
  dispatch('pointerenter',{...pointerInit,bubbles:false},true);
  dispatch('pointermove',pointerInit,true);
  dispatch('mouseover',mouseInit);
  dispatch('mouseenter',{...mouseInit,bubbles:false});
  dispatch('mousemove',mouseInit);

  await new Promise(resolve => setTimeout(resolve,180));
  const controls = Array.from(document.querySelectorAll('a[href],button,[role="button"],[role="link"]'))
    .filter(element => {
      const rect = element.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0 || element.hidden) return false;
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
      return !style || (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0');
    })
    .map(element => String(element.getAttribute?.('aria-label') || element.innerText || element.textContent || element.title || '').replace(/\\s+/g,' ').trim())
    .filter(Boolean)
    .filter((label,index,all) => all.indexOf(label) === index)
    .slice(0,15);

  return {
    ok:true,
    message:'Elemento localizado e rolado até o centro. Eventos de mouse foram enviados; nenhum botão foi clicado.',
    target:String(textOf(found)).replace(/\\s+/g,' ').trim().slice(0,240),
    visibleControls:controls,
    note:'Eventos sintéticos podem acionar handlers JavaScript, mas não ativam necessariamente CSS :hover que exige o cursor físico.'
  };
}


export function clickElementOnPage(needle) {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const wanted = normalize(needle);
  if (!wanted) return {ok:false, message:'Digite o texto do link ou botão.'};

  // Include accessible controls and common clickable task cards. A click on a
  // text descendant bubbles to a card's delegated handler, like a normal click.
  const candidates = Array.from(document.querySelectorAll(
    'a[href],button,input[type="button"],[role="button"],[role="link"],[onclick],[tabindex],div,article,li'
  ));
  const visible = candidates.filter(element => {
    const tag = String(element.tagName || '').toLowerCase();
    const type = String(element.type || '').toLowerCase();
    const role = normalize(element.getAttribute?.('role'));
    let pointerCursor = false;
    try { pointerCursor = typeof getComputedStyle === 'function' && getComputedStyle(element).cursor === 'pointer'; } catch {}
    const semanticControl = tag === 'a' || tag === 'button' || (tag === 'input' && type === 'button') ||
      role === 'button' || role === 'link' || element.hasAttribute?.('onclick') ||
      (element.hasAttribute?.('tabindex') && element.getAttribute('tabindex') !== '-1');
    if (!semanticControl && !pointerCursor) return false;
    if (element.disabled || normalize(element.getAttribute?.('aria-disabled')) === 'true') return false;
    if (type === 'submit' || type === 'reset' || type === 'image') return false;
    if (tag === 'button' && type !== 'button') return false;
    if (tag === 'input' && type !== 'button') return false;
    if (tag !== 'a' && element.closest?.('form')) return false;
    const actionLabel = normalize([
      element.getAttribute?.('aria-label'),element.innerText,element.textContent,element.value,element.title
    ].join(' '));
    if (/\b(comprar|buy|checkout|pagar|pagamento|payment|finalizar|confirmar|enviar|send|publicar|postar|excluir|apagar|delete|remover|remove|enviar mensagem)\b/i.test(actionLabel)) return false;
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
  let matches = exact.length ? exact : visible.filter(element => normalize(textOf(element)).includes(wanted));
  if (matches.length === 0) return {ok:false, message:'Não encontrei um controle ou cartão clicável visível com esse texto.'};
  // Remove only matching ancestors that contain another matching candidate.
  // Separate controls with similar labels remain ambiguous and are never guessed.
  matches = matches.filter(element =>
    !matches.some(other => other !== element && element.contains?.(other))
  );
  if (matches.length > 1) {
    const names = matches.slice(0, 4).map(textOf).filter(Boolean).join(' · ');
    return {ok:false, message:'Encontrei mais de um elemento. Use um texto mais específico: ' + names};
  }

  const found = matches[0];
  found.click();
  return {ok:true, message:'Clique executado em: ' + String(textOf(found)).trim()};
}

export function selectOptionOnPage(optionNeedle, questionNeedle = '') {
  const normalize = value => String(value || '').normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g,'').replace(/\\s+/g,' ').trim().toLocaleLowerCase();
  const wanted = normalize(optionNeedle);
  const scopeText = normalize(questionNeedle);
  if (!wanted) return {ok:false,message:'Informe o texto da opção que deseja selecionar.'};

  const selector = 'input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"]';
  const all = Array.from(document.querySelectorAll(selector));
  const rectVisible = element => {
    const rect = element?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0 || element.hidden) return false;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
    return !style || (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0');
  };
  const labelOf = element => {
    const labels = Array.from(element.labels || []).map(label => label.innerText || label.textContent || '');
    const labelledBy = String(element.getAttribute?.('aria-labelledby') || '').split(/\\s+/).filter(Boolean)
      .map(id => document.getElementById?.(id)?.innerText || document.getElementById?.(id)?.textContent || '');
    return String(element.getAttribute?.('aria-label') || labels.join(' ') ||
      element.closest?.('label')?.innerText || element.closest?.('label')?.textContent ||
      labelledBy.join(' ') || element.innerText || element.textContent || '').replace(/\\s+/g,' ').trim();
  };

  let scopeRoot = null;
  const questionMatch = scopeText.match(/(?:quest[aã]o\\s*)?0?(\\d+)/);
  if (scopeText && questionMatch) {
    const number = Number(questionMatch[1]);
    const headingCandidates = Array.from(document.querySelectorAll(
      'h1,h2,h3,h4,legend,[role="heading"],p,section,article,div,span'
    )).filter(element => {
      const label = normalize(element.innerText || element.textContent || '');
      return new RegExp('^questao\\s*0?' + number + '(?:\\s|$|de)').test(label);
    }).sort((a,b) => normalize(a.innerText || a.textContent || '').length -
      normalize(b.innerText || b.textContent || '').length);
    const heading = headingCandidates[0];
    let parent = heading?.parentElement || null;
    for (let depth=0; parent && depth<7; depth++,parent=parent.parentElement) {
      if (all.some(control => parent.contains?.(control))) { scopeRoot=parent; break; }
    }
    if (!scopeRoot) {
      return {ok:false,message:'Não consegui delimitar com segurança a questão ' + number + '. Não selecionei nenhuma opção.'};
    }
  }

  const scoped = all.filter(element => {
    if (scopeRoot && !scopeRoot.contains?.(element)) return false;
    const type = String(element.type || element.getAttribute?.('role') || '').toLowerCase();
    if (element.disabled || normalize(element.getAttribute?.('aria-disabled')) === 'true') return false;
    const label = element.closest?.('label');
    return rectVisible(element) || (label && rectVisible(label));
  });
  const matches = scoped.filter(element => {
    const label = normalize(labelOf(element));
    if (!label) return false;
    if (/^[a-d]$/.test(wanted)) return new RegExp('^' + wanted + '(?:[).:：-]|\\s)').test(label);
    return label === wanted || label.includes(wanted);
  });
  if (!matches.length) return {ok:false,message:'Não encontrei uma opção de rádio ou caixa de seleção com esse rótulo' +
    (scopeText ? ' dentro de ' + questionNeedle : '') + '.'};
  if (matches.length > 1) {
    return {ok:false,message:'Encontrei mais de uma opção correspondente. Não marquei nada; informe a questão e o texto exato.'};
  }

  const found = matches[0];
  const tag = String(found.tagName || '').toLowerCase();
  const role = normalize(found.getAttribute?.('role'));
  const before = typeof found.checked === 'boolean' ? found.checked : normalize(found.getAttribute?.('aria-checked')) === 'true';
  if ((tag === 'input' && String(found.type).toLowerCase() === 'radio' && before) ||
      (tag === 'input' && String(found.type).toLowerCase() === 'checkbox' && before) ||
      ((role === 'radio' || role === 'checkbox') && before)) {
    return {ok:true,message:'A opção já estava selecionada.',option:labelOf(found),selected:true};
  }
  found.click?.();
  const after = typeof found.checked === 'boolean' ? found.checked : normalize(found.getAttribute?.('aria-checked')) === 'true';
  if (!after) return {ok:false,message:'O clique foi tentado, mas não consegui confirmar que a opção foi selecionada.',option:labelOf(found)};
  return {ok:true,message:'Opção selecionada e verificada.',option:labelOf(found),selected:true};
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
    const sensitiveHint = [element.name,element.id,element.placeholder,element.getAttribute?.('aria-label'),autocomplete].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,' ').toLocaleLowerCase().replace(/\s+/g,' ').trim().replace(/[._-]/g,' ');
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
