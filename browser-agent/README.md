# NEX — Agente local Playwright

Este módulo conecta o NEX hospedado a um navegador que roda **no próprio Windows**. O navegador é aberto em uma janela visível e usa um perfil separado, salvo em `.nex-profile/`.

## Requisitos

- Windows 10 ou 11
- Node.js 20 ou superior disponível no PATH
- Google Chrome não é necessário: o instalador baixa o Chromium gerenciado pelo Playwright

## Instalação

1. Abra a pasta `browser-agent`.
2. Execute `install.bat` uma única vez. Ele instala a dependência Playwright e baixa o Chromium.
3. Execute `start.bat` sempre que quiser usar o navegador.
4. Copie o código mostrado no terminal.
5. No NEX, abra **Sala do Futuro**, cole o código e clique em **Conectar**.

Mantenha a janela do terminal aberta enquanto usa a integração.

## Primeiro teste

1. Clique em **Abrir Sala do Futuro**.
2. Faça login diretamente na janela que abriu, no endereço oficial `https://saladofuturo.educacao.sp.gov.br/`.
3. Quando uma atividade estiver aberta, volte ao NEX e clique em **Ler página atual**.
4. Revise o texto exibido e clique em **Preparar conteúdo no chat**. O NEX colocará o texto no campo da conversa para você revisar e enviar.

## Privacidade e segurança

- O servidor escuta apenas em `127.0.0.1`; não fica exposto à rede local ou à internet.
- O navegador usa um perfil local separado. Cookies e sessão permanecem no computador e não são enviados ao NEX.
- O código de conexão é aleatório a cada inicialização. Não compartilhe esse código.
- O servidor aceita somente origens do site NEX Preview configurado e URLs HTTPS do domínio exato da Sala do Futuro.
- O NEX não recebe nem armazena sua senha.
- Esta primeira versão só abre e lê o texto visível da Sala do Futuro. Não clica em respostas, não preenche campos e não entrega atividades.
- O conteúdo extraído é enviado do agente para a aba do NEX por uma conexão local (`127.0.0.1`) e fica na memória da página até você fechar ou recarregar a aba.

## Configuração opcional

Para usar outro endereço de preview aprovado, defina `NEX_ALLOWED_ORIGINS` como uma lista de origens exatas separadas por vírgula antes de iniciar o serviço.

Para alterar a porta, defina `NEX_BROWSER_PORT`. O padrão é `4317`. Se mudar a porta, ajuste também `NEX_BROWSER_API` no `index.html`.

## Testes

Na pasta raiz do projeto, execute:

```bash
npm test
```

Para validar a sintaxe do agente, dentro de `browser-agent`, execute:

```bash
npm run check
```

A instalação do navegador é necessária para testar a abertura real do Chromium.
