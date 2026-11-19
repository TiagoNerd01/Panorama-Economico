# Panorama Econômico

Aplicação web mobile-first para consultar indicadores econômicos, preços de ativos e expectativas de mercados de previsão. A interface em HTML, CSS e JavaScript é servida pelo Express e usa o backend do próprio projeto; não requer React nem uma etapa de compilação. Gráficos usam Chart.js.

## Requisitos

- Node.js 20.6 ou superior e npm.
- Chave da RealMarketAPI para cotações, candles e indicadores agregados com ativos.
- Acesso à internet para as APIs externas e para carregar Chart.js do jsDelivr.
- Os dados do Polymarket e do serviço de estatísticas são consultados em APIs públicas.

## Instalação e execução

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie um `.env` na raiz e configure sua chave. Não use a chave em código-fonte, commits ou no frontend:

   ```dotenv
   REALMARKET_API_KEY=sua_chave_realmarket
   PORT=3000
   ```

   `.env.example` contém um modelo. `.env` está ignorado pelo Git.

3. Inicie o servidor:

   ```bash
   npm start
   ```

   Em desenvolvimento, use `npm run dev`. Acesse `http://localhost:3000`. Para outra porta, defina `PORT` no ambiente ou no `.env`.

4. Opcionalmente, execute a suíte de testes:

   ```bash
   npm test
   ```

5. Para testar a conexão RealMarketAPI, consultar o catálogo de símbolos e confirmar as permissões da conta:

   ```bash
   npm run realmarket:check
   ```

   O script não imprime a chave nem o e-mail. A disponibilidade final depende do plano contratado.

## Interface web

Abra `http://localhost:3000` depois de iniciar o servidor. A navegação tem cinco áreas:

- **Panorama:** resumo de PIB nominal, inflação, Bitcoin, ouro e expectativas.
- **Economia:** últimos valores normalizados e séries históricas de PIB e inflação para Brasil ou Estados Unidos.
- **Mercados:** fechamento do candle e histórico para Bitcoin ou ouro; período configurável no cabeçalho.
- **Previsões:** mercados ativos relacionados aos ativos, busca textual e consulta de cotações CLOB por resultado.
- **Relatórios:** exportação do snapshot atual em JSON ou CSV e impressão/salvamento como PDF pelo navegador.

O layout prioriza telas pequenas; em celulares, a navegação fica fixa na parte inferior. País, período e botão de atualização ficam no cabeçalho. A interface usa DOM e `fetch` para chamar as rotas internas, mostra falhas por categoria e não expõe credenciais. O gráfico de preços e o histórico econômico usam Chart.js, carregado pelo CDN; as tabelas e cartões de dados continuam disponíveis se o CDN estiver inacessível.

Os relatórios são gerados no navegador a partir da última resposta do dashboard. Atualize os dados antes de exportar. O CSV inclui indicadores, preços, datas e probabilidades Yes quando disponíveis; o JSON preserva a resposta consolidada completa. A impressão abre a caixa de diálogo do navegador, onde é possível selecionar “Salvar como PDF”.

## Rotas HTTP

As rotas abaixo são relativas à origem local, por exemplo `http://localhost:3000`.

### Saúde e teste

| Método e rota | Uso |
|---|---|
| `GET /api/health` | Confirma que o servidor está online. |
| `GET /api/test` | Retorna um objeto de teste simples. |

### Estatísticas econômicas

| Método e rota | Uso |
|---|---|
| `GET /api/statistics/country/:code` | Consulta informações de um país. |
| `GET /api/statistics/country` | Consulta o país padrão (Brasil). |
| `GET /api/statistics/countries/:id` | Alias da consulta de país. |
| `GET /api/statistics/indicators` | Lista os indicadores disponíveis na fonte. |
| `GET /api/statistics/indicators/search?q=inflation` | Busca indicadores por texto. |
| `GET /api/statistics/history/indicator/:indicator/:country` | Retorna a série histórica bruta, por exemplo `IMF.NGDPD/BRA`. |
| `GET /api/statistics/normalized/:indicator/:country` | Retorna um valor histórico normalizado. O projeto reconhece `IMF.NGDPD` (PIB nominal) e `IMF.PCPIPCH` (inflação). |

### Ativos RealMarketAPI

Todos os períodos enviados devem ser aceitos pelo plano da chave. O endpoint de preço devolve o candle OHLCV concluído mais recente, **não** um fluxo instantâneo.

| Método e rota | Uso |
|---|---|
| `GET /api/markets/:symbol/price?timeFrame=H1` | Candle concluído mais recente do ativo. |
| `GET /api/markets/:symbol/history?timeFrame=H1` | Candles recentes no período selecionado. |
| `GET /api/markets/:symbol/candle?startTime=...&endTime=...` | Histórico por intervalo de datas; datas ISO 8601 com fuso. A fonte limita esse recurso a H1; `pageNumber` e `pageSize` são opcionais. |
| `GET /api/markets/BTCUSD/comparison?timeFrame=H1` | Compara o Bitcoin com a probabilidade de um mercado ativo com meta de preço. Sem mercado compatível, responde 404. |

Os períodos aceitos pelo controller são `M1`, `M5`, `M15`, `H1`, `H4` e `D1`; os recursos efetivamente disponíveis dependem do plano. O plano consultado durante o desenvolvimento liberava M1, M5 e H1. Símbolos de exemplo: `XAUUSD`, `BTCUSD` e `ETHUSD`.

### Previsões Polymarket

| Método e rota | Uso |
|---|---|
| `GET /api/predictions` | Lista mercados abertos e relevantes de Bitcoin, ouro, inflação e juros. |
| `GET /api/predictions?search=bitcoin` | Filtra mercados por tópico ou texto. |
| `GET /api/predictions/:id` | Consulta pela CLOB o preço de cada resultado e sua probabilidade implícita. |
| `GET /api/predictions/:id/history` | Consulta o histórico diário CLOB dos resultados. |

A Gamma fornece perguntas, resultados e identificadores; a CLOB fornece cotações e históricos. Resultados Yes/No são associados aos tokens correspondentes. O preço fica entre 0 e 1 e é apresentado também como percentual; representa probabilidade implícita negociada e não garante o resultado. Volume, liquidez e encerramento são incluídos quando disponíveis.

### Dashboard integrado

```http
GET /api/dashboard?country=BRA&assets=XAUUSD,BTCUSD&timeFrame=H1
```

`country` aceita um código de três letras (padrão `BRA`); `assets` aceita `XAUUSD` e `BTCUSD` separados por vírgula (padrão ambos); `timeFrame` usa H1 por padrão. O dashboard executa indicadores, cotações e mercados de previsão em paralelo. Falhas independentes são incluídas no resultado em vez de descartar todos os dados:

```json
{
  "economy": {},
  "markets": [],
  "predictions": [],
  "metadata": {
    "generatedAt": "data ISO 8601",
    "status": "complete",
    "successfulQueries": 6,
    "failedQueries": 0
  }
}
```

`metadata.status` é `complete`, `partial` ou `unavailable`. Cada resultado individual tem status `available` ou `unavailable`, e as falhas incluem código e mensagem.

## Organização do código

```text
public/
  index.html                Estrutura semântica da aplicação e suas páginas.
  styles.css                Tema responsivo mobile-first, componentes e estilos de impressão.
  app.js                    Navegação, chamadas fetch, renderização DOM, gráficos e exportação.
src/
  server.js                 Configuração Express, publicação de public/ e montagem das rotas.
  controllers/              Validação de parâmetros e respostas HTTP.
  routes/                   Declaração das rotas Express.
  services/
    statisticsService.js    Integração e normalização dos indicadores econômicos.
    realMarketService.js    Consultas autenticadas à RealMarketAPI.
    polyMarketService.js    Descoberta e normalização de mercados Gamma.
    clobService.js          Preços e históricos dos resultados pela CLOB.
    marketComparisonService.js Comparação do candle BTC com mercado-alvo.
    dashboardService.js     Agregação paralela e tolerante a falhas.
    testService.js          Dados demonstrativos da rota de teste.
  scripts/
    checkRealMarket.js      Verificação de conexão, catálogo e plano.
test/                       Testes automatizados Node.js para serviços e agregação.
```

Os arquivos `src/controllers/reportController.js`, `src/routes/reportRoutes.js` e `src/services/docSpringService.js` são espaços reservados vazios; a rota de relatórios de documentos ainda não é um serviço backend. A geração disponível atualmente é realizada pela página Relatórios no frontend.

## Testes

Os testes usam o runner nativo do Node (`node --test`) e mocks de `fetch` para cobrir agregação do dashboard, falhas parciais, associação de tokens, busca de mercados e comparação. Não precisam chamar as APIs externas nem usar a chave RealMarketAPI.

## Notas sobre dados e segurança

- Nunca compartilhe ou comite chaves de API. Caso uma chave tenha sido exposta, revogue-a e gere outra.
- Os dados econômicos dependem da disponibilidade da fonte externa e podem conter apenas os últimos valores publicados.
- Erros de APIs externas aparecem no dashboard como falhas individuais; consulte a mensagem no painel/API para identificar a categoria.
- Não use preços ou probabilidades como aconselhamento financeiro.
