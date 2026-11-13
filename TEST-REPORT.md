# NEX Core 0.2.0 — Etapa 1

## Escopo
Dataset versionado, separação treino/validação/teste, gradiente médio por lote, embaralhamento determinístico, early stopping, classe `unknown`, rejeição por confiança/margem/vocabulário e métricas de classificação. Os motores de vídeo e programação foram preservados.

## Teste executado

```text
npm test
```

Resultado real:

```json
{
  "ok": true,
  "epochs": 209,
  "initialLoss": 1.605874548721618,
  "finalTrainLoss": 0.08600690127811383,
  "finalValidationLoss": 1.3907645635758938,
  "testAccuracy": 0.5,
  "macroF1": 0.4,
  "unknownRejected": 1,
  "filesPreserved": ["src/engines/video-engine.js", "src/engines/code-engine.js"]
}
```

## Interpretação honesta

A suíte passou e comprovou que os pesos mudam, que o gradiente médio e o early stopping executam, que treino e validação são medidos separadamente e que as mensagens desconhecidas do conjunto definido foram rejeitadas. A acurácia de teste de 50% e F1 macro de 0,40 mostram que a generalização ainda não é suficiente. A causa provável é o conjunto de dados muito pequeno e semanticamente estreito, não um sucesso de compreensão geral. Não declarar esta etapa como modelo conversacional pronto.

## Arquivos alterados

- `src/neural/tiny-mlp.js`: gradientes acumulados e aplicados uma vez por lote; shuffle; early stopping; margem e razão de tokens reconhecidos.
- `data/training-data.js`: versão do dataset e splits fixos, incluindo exemplos `unknown`.
- `src/intent-router.js`: limiar de confiança, margem e rejeição.
- `src/evaluation/metrics.js`: accuracy, precision, recall, F1 macro e matriz de confusão; métricas de rejeição.
- `src/chat-engine.js`: treinamento/avaliação com splits e resposta de esclarecimento.
- `src/nex-core.js`: avaliação, load/save com schemaVersion e API pública preservada.
- `src/index.js`: exportações novas.
- `tests/run-tests.mjs`: testes da etapa 1.

## Limitações e próxima etapa

Ainda não há n-grams, calibração estatística da confiança, teste amplo de paráfrases, contexto conversacional, memória tipada ou geração de respostas. A próxima etapa recomendada é ampliar e revisar o dataset com exemplos independentes, adicionar teste de vazamento/paráfrases e calibrar a rejeição com uma matriz de confusão completa antes de mexer em contexto e memória.

## Auditoria adicional executada

Foi adicionada uma verificação automática de duplicatas e similaridade lexical entre treino, validação e teste. Resultado: `duplicateCount=0`, `similarPairCount=0`, `passed=true`.

Matriz de confusão do teste:

```text
              video code memory general unknown
video            1    0      0       0       0
code             0    1      0       0       0
memory           0    0      0       1       0
general          0    0      0       0       0
unknown          0    0      0       0       0
```

Como cada classe conhecida tem apenas um exemplo no teste, a matriz é informativa, mas estatisticamente fraca. Ela mostra que `memory` foi confundida com `general` e que o exemplo de `general` foi rejeitado ou não aceito. Isso confirma a necessidade de ampliar o dataset antes de evoluir para contexto e memória avançada.
