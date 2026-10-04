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
