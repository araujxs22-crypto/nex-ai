export const DATASET_VERSION='0.2.0-intents-1';
export const TRAIN_EXAMPLES=[
{label:'video',text:'crie uma cena 3d com uma nave'},{label:'video',text:'planeje uma animacao de personagem andando'},{label:'video',text:'monte um ambiente com luz e objetos'},{label:'video',text:'roteiro visual para um video'},
{label:'code',text:'crie um projeto javascript'},{label:'code',text:'analise este codigo e encontre bugs'},{label:'code',text:'preciso de uma funcao em python'},{label:'code',text:'estruture os arquivos do aplicativo'},
{label:'memory',text:'lembre que meu projeto se chama nex'},{label:'memory',text:'guarde esta informacao para depois'},{label:'memory',text:'salve esta preferencia'},{label:'memory',text:'registre este dado importante'},
{label:'general',text:'ola como voce esta'},{label:'general',text:'explique o que e inteligencia artificial'},{label:'general',text:'qual a diferenca entre treino e memoria'},{label:'general',text:'responda uma pergunta comum'},
{label:'unknown',text:'qual a receita de bolo de cenoura'},{label:'unknown',text:'conte uma piada sobre futebol'},{label:'unknown',text:'qual a previsao do tempo amanha'},{label:'unknown',text:'me indique um filme para assistir'}
];
export const VALIDATION_EXAMPLES=[
{label:'video',text:'quero planejar uma tomada cinematografica'},{label:'code',text:'me ajude a encontrar um erro no programa'},{label:'memory',text:'anote essa preferencia para lembrar depois'},{label:'general',text:'podemos conversar sobre tecnologia'}
];
export const TEST_EXAMPLES=[
{label:'video',text:'descreva uma sequencia visual com camera'},{label:'code',text:'como organizo os arquivos do software'},{label:'memory',text:'o que voce consegue recordar'},{label:'general',text:'me explique uma ideia de forma simples'}
];
export const UNKNOWN_EXAMPLES=['qual e a receita de bolo de cenoura','conte uma piada sobre futebol','qual a previsao do tempo amanha','me indique um filme para assistir'];
