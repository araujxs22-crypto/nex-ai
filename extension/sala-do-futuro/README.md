# NEX — Agente de Navegador (Chrome)

Extensão Manifest V3 para interagir com páginas HTTPS na aba ativa, sem Node.js, servidor local ou Playwright.

## Instalação
1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione esta pasta extraída do repositório.
5. Fixe o NEX na barra do Chrome.

## Uso
1. Abra um site HTTPS.
2. Clique no ícone do NEX.
3. Use **Ler página** para extrair o texto visível.
4. Use **Clicar no elemento encontrado** para acionar um botão/link pelo texto visível.
5. Use **Preencher campo** para preencher um campo identificado por rótulo, nome ou placeholder. O formulário não é enviado.
6. Para mudar de site, informe um endereço HTTPS e clique em **Abrir endereço**. Depois que carregar, abra novamente a extensão.

## Segurança e limites
- Manifest V3 com apenas `activeTab`, `scripting` e `clipboardWrite`.
- Acesso temporário à aba ativa após você abrir a extensão; não há permissão ampla para todos os sites.
- Recusa páginas HTTP e endereços com usuário/senha embutidos.
- Não lê cookies, senhas ou histórico.
- Não envia formulários, mensagens, compras ou atividades.
- Cada ação é iniciada por você e deve ser conferida na página.

Esta versão é controle manual assistido. Ainda não inclui planejamento autônomo multi-etapas, visão de tela ou conexão OAuth com serviços Google.
