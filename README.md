# Painel TSE 2026

Painel estático para acompanhar resultados oficiais das Eleições 2026 diretamente dos JSONs públicos do Tribunal Superior Eleitoral.

## Visões

- Presidente — cenário geral: Lula, Flávio Bolsonaro e todos os demais candidatos acima de 1% dos votos válidos.
- Lula × Flávio por UF, com destaque visual do líder, diferença nominal, filtros por região e ordenação.
- Senado — 1º e 2º colocados por UF, com partido e percentual.

## Interface

- Atualização automática a cada 15 segundos.
- EA14 usado como detector de mudanças para reduzir consultas aos arquivos EA20 durante a atualização automática.
- Flash discreto nas células que mudaram desde a leitura anterior.
- Barra de progresso nacional, filtros rápidos e cabeçalhos fixos.
- Tema claro/escuro e preferências de visualização persistidas no navegador.
- Layout responsivo para celular e melhorias de acessibilidade para teclado e leitores de tela.
- Em falha temporária de rede, o painel mantém a última leitura disponível.

## GitHub Pages

O projeto é 100% estático (`index.html`, `style.css`, `app.js`) e é publicado diretamente pelo GitHub Pages a partir da branch `main` e pasta `/ (root)`.

## Fonte

Dados obtidos dos arquivos JSON oficiais em `https://resultados.tse.jus.br`.

Este projeto é independente e não faz projeções, previsões ou recomendações eleitorais.


## Vaga matematicamente garantida no Senado

Durante a totalização parcial, o painel pode exibir `🔒 Vaga garantida` para o 1º ou 2º colocado. É um cálculo conservador, separado da atribuição oficial do TSE:

- usa os votos absolutos atuais do candidato;
- usa os votos atuais do 3º colocado;
- usa `e.esnt`, o eleitorado das seções ainda não totalizadas;
- considera a vaga garantida somente quando `votos do candidato > votos do 3º + eleitorado restante`.

Assim, mesmo no cenário extremo em que cada eleitor ainda não totalizado desse um voto ao 3º colocado e nenhum ao candidato, o 3º não conseguiria alcançá-lo. O selo `✓ Eleito TSE` continua reservado ao campo oficial `cand.e = "s"`.
