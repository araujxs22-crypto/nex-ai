const OBJECT_DEFINITIONS = [
  {terms:['nave','astronave','espaçonave','foguete'],type:'spaceship',label:'Nave'},
  {terms:['robo','robô','android'],type:'robot',label:'Robô'},
  {terms:['personagem','pessoa','humano','boneco'],type:'character',label:'Personagem'},
  {terms:['cidade','metropole','metrópole'],type:'city',label:'Cidade'},
  {terms:['floresta','bosque','natureza'],type:'forest',label:'Floresta'},
  {terms:['arvore','árvore'],type:'tree',label:'Árvore'},
  {terms:['predio','prédio','edificio','edifício'],type:'building',label:'Prédio'},
  {terms:['carro','automovel','automóvel','veiculo','veículo'],type:'car',label:'Carro'},
  {terms:['casa','residencia','residência'],type:'house',label:'Casa'},
  {terms:['planeta','lua','mundo'],type:'planet',label:'Planeta'}
];

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function inferAnimation(text) {
  if (/\b(girando|girar|rotacionando|rotacao|rotacionar)\b/.test(text)) return {type:'spin',loop:true};
  if (/\b(voando|voar|flutuando|flutuar)\b/.test(text)) return {type:'float',loop:true};
  if (/\b(andando|caminhando|correndo|movimento|se movendo)\b/.test(text)) return {type:'walk-cycle',loop:true};
  if (/\b(avancando|avançando|aproximando|aproximar)\b/.test(text)) return {type:'move-forward',loop:false};
  return null;
}

export class NexVideoEngine {
  plan(prompt = '') {
    const normalized = normalize(prompt);
    const durationMatch = normalized.match(/\b(\d{1,2})\s*(?:s|seg|segundo|segundos)\b/);
    const durationSeconds = clamp(Number(durationMatch?.[1] || 8), 2, 60);
    const objects = [];
    const usedTypes = new Set();

    for (const definition of OBJECT_DEFINITIONS) {
      const foundTerm = definition.terms.find(term => normalized.includes(normalize(term)));
      if (!foundTerm || usedTypes.has(definition.type)) continue;
      usedTypes.add(definition.type);
      const index = objects.length;
      const position = index === 0
        ? [0, definition.type === 'spaceship' || definition.type === 'planet' ? 1.2 : 0.8, 0]
        : [((index % 3) - 1) * 2.4, 0.7, Math.floor(index / 3) * -2.2];
      objects.push({
        id: definition.type + '_' + (index + 1),
        type: definition.type,
        label: definition.label,
        transform: {
          position,
          rotation: [0, index * 0.35, 0],
          scale: [1, 1, 1]
        },
        material: {palette: index % 2 === 0 ? 'primary' : 'secondary', metallic: definition.type === 'spaceship'},
        animation: inferAnimation(normalized)
      });
    }

    if (objects.length === 0) {
      objects.push({
        id:'subject_1',
        type:'generic-subject',
        label:'Objeto principal',
        transform:{position:[0,0.8,0],rotation:[0,0,0],scale:[1,1,1]},
        material:{palette:'primary',metallic:false},
        animation:inferAnimation(normalized)
      });
    }

    const environment = /\b(noite|noturno|escuro|lua)\b/.test(normalized)
      ? 'night'
      : /\b(por do sol|entardecer|sunset)\b/.test(normalized)
        ? 'sunset'
        : /\b(espaco|espacial|galaxia|galáxia)\b/.test(normalized)
          ? 'space'
          : 'day';

    const cameraMotion = /\b(pan|panoramica|panorâmica|varrendo)\b/.test(normalized)
      ? 'pan'
      : /\b(orbita|orbitando|giro de camera|giro da camera)\b/.test(normalized)
        ? 'orbit'
        : /\b(tracking|acompanhando|seguindo)\b/.test(normalized)
          ? 'tracking'
          : 'static';
    const shot = /\b(close up|closeup|close|detalhe|rosto)\b/.test(normalized)
      ? 'close-up'
      : /\b(panorama|plano geral|paisagem|wide)\b/.test(normalized)
        ? 'wide'
        : 'medium';

    const camera = {
      shot,
      motion:cameraMotion,
      focalLength:shot === 'close-up' ? 75 : shot === 'wide' ? 28 : 50,
      position:shot === 'close-up' ? [0,2.1,5.5] : shot === 'wide' ? [0,6,15] : [0,3.5,10],
      target:[0,0.8,0]
    };

    const lighting = {
      key:environment === 'night' ? 'moonlight' : environment === 'sunset' ? 'sunset' : 'soft-daylight',
      colorTemperature:environment === 'night' ? 'cool' : environment === 'sunset' ? 'warm' : 'neutral',
      intensity:environment === 'night' ? 0.55 : 1.15,
      shadows:true
    };

    const timeline = [
      {time:0,action:'establish-scene',camera:cameraMotion},
      {time:Number((durationSeconds * 0.2).toFixed(2)),action:'begin-subject-animation',objectIds:objects.filter(object => object.animation).map(object => object.id)},
      {time:Number((durationSeconds * 0.55).toFixed(2)),action:'camera-move',camera:cameraMotion},
      {time:durationSeconds,action:'end-shot'}
    ];

    return {
      schema:'nex.video-plan.v2',
      prompt:String(prompt),
      scene:{environment,objects},
      camera,
      lighting,
      timeline,
      durationSeconds,
      capabilities:{
        planning:true,
        proceduralPreview:true,
        rendering:false,
        videoGeneration:false
      },
      limitations:[
        'Este resultado é um plano estruturado; ainda não é um vídeo renderizado.',
        'Modelos detalhados, texturas e movimentos complexos precisam de assets e de um pipeline de renderização.'
      ]
    };
  }
}
