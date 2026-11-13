const normalize = value => String(value ?? '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[!?.,;:]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const reply = text => ({type: 'chat', text});

export function respondToSocialMessage(input) {
  const original = String(input ?? '').trim();
  const text = normalize(original);
  if (!text) return {type: 'clarification', text: 'Pode escrever sua mensagem. Estou ouvindo.'};

  if (/^(oi|ola|eai|opa|salve|hey|hello|bom dia|boa tarde|boa noite)$/.test(text)) {
    return reply('Oi! Estou aqui. Pode conversar comigo ou mandar uma tarefa de programação, planejamento 3D ou vídeo.');
  }

  if (/^(tudo bem|como voce esta|como vai|ta tudo bem)$/.test(text)) {
    return reply('Estou funcionando normalmente e pronta para trabalhar. E você, o que vamos fazer?');
  }

  if (/^(obrigado|obrigada|valeu|vlw|brigado|brigada|muito obrigado|muito obrigada)$/.test(text)) {
    return reply('Por nada. Pode mandar a próxima.');
  }

  if (/^(kkk+|rs+|h(ah)+|lol+)$/.test(text)) {
    return reply('Hehe. Pode continuar.');
  }

  if (text === 'loli') {
    return {
      type: 'clarification',
      text: 'Não reconheci “loli”. Você quis escrever “lol” ou estava testando minha interpretação?'
    };
  }

  if (/^(ok|okay|certo|beleza|blz|entendi|sim|pode|isso|aham)$/.test(text)) {
    return reply('Certo. Pode continuar; estou acompanhando.');
  }

  if (/^(nao|negativo|deixa|deixa pra la|esquece)$/.test(text)) {
    return reply('Sem problema. Seguimos quando você quiser.');
  }

  if (/^(quem e voce|o que voce e|o que voce faz|quais suas funcoes)$/.test(text)) {
    return reply('Sou o NEX. Meu núcleo atual identifica tarefas, ajuda com análise de código, planeja cenas 3D e organiza memórias. Ainda não sou um LLM generativo de conhecimento geral.');
  }

  if (/^(explique tudo que pode fazer|explique tudo oq pode fazer|o que voce consegue fazer|oque voce pode fazer|o que voce pode fazer|oque vc pode fazer|o que vc pode fazer|quais sao suas capacidades|me diga suas funcoes)$/.test(text)) {
    return reply('Posso ajudar com programação: analisar trechos de código, identificar alguns erros e estruturar projetos. Também posso transformar ideias em planos de cenas e vídeos 3D, além de guardar e recuperar memórias. Minha conversa geral ainda é limitada e posso não entender pedidos fora dessas áreas.');
  }

  if (/\b(consegue|pode|da para)\b.*\b(criar|gerar|fazer)\b.*\b(imagens?|fotos?|ilustracoes?)\b|\b(criar|gerar)\b.*\b(imagens?|fotos?|ilustracoes?)\b/.test(text)) {
    return reply('Ainda não. No momento, o NEX não tem um motor de geração de imagens integrado. Posso ajudar a escrever um prompt e planejar a imagem, mas não consigo renderizá-la diretamente.');
  }

  return null;
}
