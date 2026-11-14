# NEX — Agente de Navegador (Chrome)

Extensão Manifest V3 que conecta o site NEX ao Chrome por uma ponte local de mensagens. Não usa WebSocket, servidor local, Playwright ou API externa.

## Instalação
1. Baixe e extraia o ZIP desta branch.
2. Abra chrome://extensions.
3. Ative o Modo do desenvolvedor.
4. Clique em Carregar sem compactação.
5. Selecione a pasta extension/sala-do-futuro.
6. Fixe a extensão na barra do Chrome.

## Pareamento e autorização
1. Abra a página HTTPS que deseja controlar.
2. Abra o popup da extensão nessa aba e clique em Autorizar esta aba.
3. Gere e copie o código temporário (válido por cinco minutos).
4. Abra https://nex-ai-preview-git-feat-nex-browser-agent-araujxs22-8685.vercel.app e entre em Agente de Navegador · Chrome.
5. Cole o código e clique em Conectar extensão.
6. No chat do NEX, use: ler página; passar mouse sobre Tarefa 5; abrir https://exemplo.com; clicar em Pesquisar; preencher campo Nome com Kaue; voltar; avançar; recarregar.

O comando "passar mouse sobre ..." rola o elemento para o centro da tela e envia eventos pointer/mouse para handlers JavaScript. Eventos sintéticos não ativam necessariamente regras CSS :hover que dependam do cursor físico; nessa situação, será necessário adicionar uma etapa de controle de mouse real com permissão extra do Chrome. O comando apenas revela/inspeciona elementos; não clica no botão revelado.

Ao navegar para outro domínio, a permissão temporária do Chrome pode ser revogada. Abra o popup na página de destino e autorize-a novamente antes de continuar.

## Segurança
- O content script de comunicação roda somente em https://nex-ai-preview-git-feat-nex-browser-agent-araujxs22-8685.vercel.app/.
- O agente controla somente a aba explicitamente autorizada pelo popup.
- A ponte valida a origem do site e o formato/tipo dos comandos.
- Somente URLs HTTPS sem credenciais são aceitas.
- Não lê cookies, senhas, códigos de autenticação ou dados de cartão.
- O preenchimento não envia formulários; botões dentro de formulários, botões submit/reset e links javascript:, mailto: ou tel: são bloqueados.
- Ações precisam ser solicitadas explicitamente no chat. Não há execução autônoma em segundo plano.
- O Kill-Switch persiste como pausa e bloqueia novos comandos. Uma operação DOM síncrona que já tenha começado não pode ser revertida; esta versão não executa planos longos de múltiplas etapas.
- O pareamento usa código aleatório de uso único com expiração de cinco minutos. O token não é enviado a um servidor.

Esta é uma primeira versão funcional de comandos assistidos, não um agente autônomo que decide e executa sequências sem novas instruções.