# NEX — Agente de Navegador (Chrome)

Extensão Manifest V3 para navegar e interagir com páginas HTTPS na aba ativa. Não exige Node.js, servidor local ou Playwright para uso normal.

## Instalação
1. Baixe e extraia o ZIP desta branch.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta `extension/sala-do-futuro` extraída.
6. Fixe o NEX na barra do Chrome.

## Uso
1. Abra o NEX pela barra de extensões.
2. Pesquise no Google ou informe um endereço; domínios sem protocolo recebem HTTPS automaticamente.
3. Use **Ler página** para extrair o texto visível.
4. Use **Voltar**, **Avançar** e **Recarregar** para controlar o histórico da aba.
5. Use **Clicar no elemento encontrado** com o texto visível do link ou botão.
6. Use **Preencher campo** para digitar em campos de texto ou escolher uma opção de lista suspensa.
7. Copie o conteúdo lido para a conversa do NEX e confira cada ação na página.

## Segurança e limites
- Manifest V3 com apenas `activeTab`, `scripting` e `clipboardWrite`.
- O acesso é temporário à aba ativa depois que você abre a extensão.
- Recusa páginas HTTP e endereços com usuário/senha embutidos.
- Não lê cookies, senhas, histórico ou códigos de verificação.
- Ignora campos de senha, campos ocultos e botões de envio.
- Preencher um campo não envia formulários, mensagens, compras ou atividades.
- O preenchimento altera o valor do campo e dispara eventos de entrada/alteração; não simula teclas físicas.
- Correspondências ambíguas exigem um texto mais específico.
- Cada ação é iniciada por você e deve ser conferida na página.

Esta versão ainda é um agente assistido por comandos, não um agente autônomo multi-etapas com visão de tela.
