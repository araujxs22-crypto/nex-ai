export const DATASET_VERSION = '0.3.0-ngram-tfidf-1';

export const TRAIN_EXAMPLES = [
  // video: planejamento de cenas, animação, câmera e iluminação
  {label: 'video', text: 'crie uma cena tridimensional de uma nave pousando'},
  {label: 'video', text: 'planeje a animacao de um robo atravessando a sala'},
  {label: 'video', text: 'monte um cenario noturno com neblina e iluminacao azul'},
  {label: 'video', text: 'desenvolva um storyboard com tres tomadas de acao'},
  {label: 'video', text: 'descreva movimentos de camera para uma perseguição'},
  {label: 'video', text: 'organize a timeline de um personagem correndo'},
  {label: 'video', text: 'prepare a composicao visual de uma cidade futurista'},
  {label: 'video', text: 'quero uma sequencia animada com particulas brilhantes'},
  {label: 'video', text: 'defina luzes sombras e enquadramento para uma floresta'},
  {label: 'video', text: 'crie um plano de filmagem para uma cena de fantasia'},
  {label: 'video', text: 'gere um roteiro de tomadas para um curta animado'},
  {label: 'video', text: 'estruture os objetos e movimentos de um ambiente 3d'},

  // code: programação, depuração, arquitetura e documentação
  {label: 'code', text: 'escreva um script javascript para validar um formulario'},
  {label: 'code', text: 'revise esta funcao python e aponte falhas'},
  {label: 'code', text: 'gere a estrutura de pastas de uma aplicacao web'},
  {label: 'code', text: 'corrija o erro de sintaxe neste programa'},
  {label: 'code', text: 'implemente uma rotina para ordenar uma lista'},
  {label: 'code', text: 'explique como separar modulos no projeto'},
  {label: 'code', text: 'crie uma classe em javascript para controlar usuarios'},
  {label: 'code', text: 'encontre possiveis bugs neste trecho de codigo'},
  {label: 'code', text: 'monte um arquivo de configuracao para o aplicativo'},
  {label: 'code', text: 'adicione tratamento de erros a funcao'},
  {label: 'code', text: 'transforme esta logica em um componente reutilizavel'},
  {label: 'code', text: 'documente os parametros desta API'},

  // memory: armazenamento, consulta e recuperação de informações
  {label: 'memory', text: 'guarde que prefiro respostas curtas'},
  {label: 'memory', text: 'lembre que o NEX e meu projeto principal'},
  {label: 'memory', text: 'anote meu objetivo para consultar depois'},
  {label: 'memory', text: 'registre essa configuracao como preferencia'},
  {label: 'memory', text: 'o que voce lembra sobre meu projeto?'},
  {label: 'memory', text: 'recupere a informacao que eu pedi para guardar'},
  {label: 'memory', text: 'procure nas memorias o nome do aplicativo'},
  {label: 'memory', text: 'qual foi a preferencia que deixei salva?'},
  {label: 'memory', text: 'consulte a anotacao sobre minha rotina'},
  {label: 'memory', text: 'quero armazenar esta ideia para outro dia'},
  {label: 'memory', text: 'adicione este detalhe as minhas lembrancas'},
  {label: 'memory', text: 'me diga o que ficou registrado anteriormente'},

  // general: conversa e explicações gerais, sem acionar ferramentas
  {label: 'general', text: 'oi podemos conversar um pouco?'},
  {label: 'general', text: 'explique a diferenca entre aprender e memorizar'},
  {label: 'general', text: 'o que significa inteligencia artificial?'},
  {label: 'general', text: 'como funciona o raciocinio humano?'},
  {label: 'general', text: 'me ajude a entender esse conceito'},
  {label: 'general', text: 'quero discutir uma ideia sobre tecnologia'},
  {label: 'general', text: 'qual e a finalidade de estudar matematica?'},
  {label: 'general', text: 'resuma o conceito de criatividade'},
  {label: 'general', text: 'por que as pessoas fazem perguntas?'},
  {label: 'general', text: 'me explique isso com palavras simples'},
  {label: 'general', text: 'como voce descreveria o aprendizado?'},
  {label: 'general', text: 'vamos falar sobre ciencia'},

  // unknown: pedidos fora das capacidades locais do NEX
  {label: 'unknown', text: 'me ensine a preparar uma sopa de legumes'},
  {label: 'unknown', text: 'conte uma piada sobre animais'},
  {label: 'unknown', text: 'qual sera a temperatura em Recife amanha?'},
  {label: 'unknown', text: 'recomende um documentario de historia'},
  {label: 'unknown', text: 'resolva esta conta de divisao com numeros grandes'},
  {label: 'unknown', text: 'qual e o resultado da partida de basquete?'},
  {label: 'unknown', text: 'me ajude a traduzir uma frase para frances'},
  {label: 'unknown', text: 'quem ganhou o campeonato estadual?'},
  {label: 'unknown', text: 'qual o valor do dolar neste momento?'},
  {label: 'unknown', text: 'sugira lugares para visitar durante o feriado'},
  {label: 'unknown', text: 'como cuidar de uma planta de tomate?'},
  {label: 'unknown', text: 'me passe uma receita de panqueca'}
];

export const VALIDATION_EXAMPLES = [
  {label: 'video', text: 'planeje uma cena com camera lenta e fumaca'},
  {label: 'video', text: 'crie animacao curta de um carro pulando'},
  {label: 'video', text: 'organize as luzes para um estudio virtual'},
  {label: 'video', text: 'monte quadros de um clipe em 3d'},

  {label: 'code', text: 'faca um programa em Python que leia um arquivo'},
  {label: 'code', text: 'analise o codigo e localize uma excecao'},
  {label: 'code', text: 'crie componentes para a interface do site'},
  {label: 'code', text: 'escreva testes automatizados para essa funcao'},

  {label: 'memory', text: 'salve a informacao do prazo do projeto'},
  {label: 'memory', text: 'voce pode lembrar o nome que mencionei?'},
  {label: 'memory', text: 'busque a anotacao que fiz ontem'},
  {label: 'memory', text: 'quero registrar uma nova preferencia'},

  {label: 'general', text: 'por que o ceu muda de cor ao entardecer?'},
  {label: 'general', text: 'explique a ideia de energia de forma simples'},
  {label: 'general', text: 'vamos conversar sobre aprendizado'},
  {label: 'general', text: 'o que e uma hipotese cientifica?'},

  {label: 'unknown', text: 'como fazer arroz soltinho?'},
  {label: 'unknown', text: 'conte uma historia engracada de gato'},
  {label: 'unknown', text: 'vai fazer frio em Curitiba no domingo?'},
  {label: 'unknown', text: 'sugira um jogo de corrida para celular'}
];

export const TEST_EXAMPLES = [
  {label: 'video', text: 'desenhe a sequencia de uma nave entrando no hangar'},
  {label: 'video', text: 'crie uma animacao 3d de uma esfera quicando'},
  {label: 'video', text: 'defina a posicao da camera para filmar um robo'},
  {label: 'video', text: 'planeje a iluminacao de um cenario de terror'},
  {label: 'video', text: 'monte um storyboard de uma perseguicao de carros'},
  {label: 'video', text: 'gere uma timeline para um personagem saltando'},

  {label: 'code', text: 'implemente uma funcao que verifica um endereco de email'},
  {label: 'code', text: 'encontre a causa deste erro no codigo fonte'},
  {label: 'code', text: 'prepare um modulo para conectar ao banco de dados'},
  {label: 'code', text: 'construa uma pagina usando HTML e JavaScript'},
  {label: 'code', text: 'otimize este algoritmo para executar mais rapido'},
  {label: 'code', text: 'adicione comentarios explicando esta classe'},

  {label: 'memory', text: 'guarde o endereco do site do projeto'},
  {label: 'memory', text: 'quais detalhes voce ainda recorda sobre mim?'},
  {label: 'memory', text: 'encontre a informacao que deixei anotada'},
  {label: 'memory', text: 'registre que prefiro usar ferramentas gratuitas'},
  {label: 'memory', text: 'consulte o que foi salvo sobre meus objetivos'},
  {label: 'memory', text: 'anote esse novo detalhe para uma proxima conversa'},

  {label: 'general', text: 'como surgiu a teoria da gravidade?'},
  {label: 'general', text: 'explique o que e uma metafora'},
  {label: 'general', text: 'por que aprender coisas novas e importante?'},
  {label: 'general', text: 'qual a relacao entre ciencia e curiosidade?'},
  {label: 'general', text: 'me conte uma explicacao simples sobre atomos'},
  {label: 'general', text: 'o que voce entende por pensamento criativo?'},

  {label: 'unknown', text: 'como preparar um molho de tomate caseiro?'},
  {label: 'unknown', text: 'me conte uma charada curta sobre escola'},
  {label: 'unknown', text: 'qual a previsao de chuva para sabado?'},
  {label: 'unknown', text: 'indique uma serie de suspense para assistir'},
  {label: 'unknown', text: 'quanto e vinte e nove vezes quatorze?'},
  {label: 'unknown', text: 'qual foi o placar do Corinthians no ultimo jogo?'}
];

// Estes exemplos são OOD: não aparecem em treino, validação ou teste.
export const UNKNOWN_EXAMPLES = [
  'qual o melhor jeito de temperar feijao?',
  'conte uma historia curta sobre um dragao',
  'vai chover em minha cidade no proximo fim de semana?',
  'recomende um livro de aventura para adolescentes',
  'quanto custa uma passagem de aviao para Salvador?',
  'quem venceu a final do campeonato ontem?',
  'traduza bom dia para japones',
  'qual a cotacao do euro hoje?',
  'me ensine a desenhar um cachorro',
  'como devo cuidar de uma bicicleta enferrujada?'
];

// OOD para calibração dos limites: separado do conjunto OOD reservado ao teste.
export const UNKNOWN_CALIBRATION_EXAMPLES = [
  'qual a capital da Noruega?',
  'como faço arroz integral na panela?',
  'conte uma aventura sobre um pirata',
  'qual a taxa de juros da poupanca?',
  'me ensine um truque de magica simples',
  'quando começa o proximo feriado nacional?',
  'quais exercicios ajudam um goleiro?',
  'quanto vale cento e cinquenta dolares em reais?'
];
