# Relatório técnico para revisão independente

A etapa 1 do NEX Core 0.2.0 foi implementada sem alterar HTML ou interface. O classificador continua sendo uma MLP pequena, mas agora acumula gradientes de todos os exemplos do lote antes de atualizar os pesos. O treinamento embaralha deterministicamente os dados, mede validação e restaura o melhor checkpoint por perda de validação.

A classe `unknown` foi incluída como sinal supervisionado, mas a decisão final também usa três sinais: confiança softmax mínima, margem entre as duas classes mais prováveis e proporção de tokens reconhecidos. Esses sinais são heurísticos; softmax não é uma probabilidade calibrada de verdade.

A API `NexCore.train`, `NexCore.ask`, `NexCore.status` e os engines existentes foram preservados. `NexCore.evaluate()` passou a expor previsões de teste e desconhecidos. O armazenamento de modelo inclui `schemaVersion`, labels e vocabulário.

Resultado real: 209 épocas, perda de treino 1,605875 para 0,086007, perda de validação final 1,390765, acurácia de teste 0,50, F1 macro 0,40 e taxa de desconhecidos rejeitados 1,00. A validação/teste ainda são pequenos; isso é uma base de avaliação, não evidência de compreensão geral.

Perguntas para revisão: os limiares devem ser aprendidos/calibrados com um conjunto de calibração separado? Devemos adicionar n-grams de caracteres antes de aumentar a MLP? Como ampliar as paráfrases sem vazar semântica entre splits? A recomendação é resolver avaliação e dados antes de implementar contexto conversacional.
