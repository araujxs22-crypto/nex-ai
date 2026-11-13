# NEX — Leitor da Sala do Futuro (Chrome)

Extensão Manifest V3 sem Node.js, servidor local, Playwright ou APIs externas.

## Instalação no Chrome

1. Baixe o ZIP do repositório NEX e extraia-o.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta `extension/sala-do-futuro` extraída do ZIP.
6. Fixe a extensão NEX na barra do Chrome pelo menu de extensões.

## Uso

1. Abra `https://saladofuturo.educacao.sp.gov.br/` e entre normalmente.
2. Abra a atividade que deseja estudar.
3. Clique no ícone da extensão NEX.
4. Clique em **Ler página atual**.
5. Clique em **Copiar texto para o NEX**.
6. Volte à conversa do NEX, cole com `Ctrl+V` e peça uma explicação passo a passo.

## Permissões e privacidade

A extensão usa Manifest V3 e pede apenas:
- `activeTab`: acesso temporário à aba ativa após clicar na extensão.
- `scripting`: executar uma leitura simples do texto visível na aba ativa.
- `clipboardWrite`: copiar o texto somente depois que você clicar no botão de cópia.

Não há permissões amplas de todos os sites, cookies, histórico ou armazenamento. A extensão recusa URLs que não sejam HTTPS no host exato `saladofuturo.educacao.sp.gov.br`. Ela não lê campos de senha, não clica em respostas, não preenche campos nem envia/entrega atividades.
