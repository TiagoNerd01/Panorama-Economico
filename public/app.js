const state = {
    country: 'BRA',
    timeFrame: 'H1',
    activePage: 'panorama',
    activeSymbol: 'BTCUSD',
    dashboard: null,
    charts: {},
    economyHistoryCountry: null,
    predictionSearch: '',
    predictionMarkets: [],
    predictionVisibleCount: 24
};

const countryNames = {
    BRA: 'Brasil',
    USA: 'Estados Unidos'
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
});
const compactCurrencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2
});
const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
});
let toastTimer;

const byId = id => document.getElementById(id);
const makeElement = (tagName, className, text) => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
};

const formatCurrency = value => {
    const number = Number(value);
    return Number.isFinite(number) ? currencyFormatter.format(number) : '—';
};

const formatCompactCurrency = value => {
    const number = Number(value);
    return Number.isFinite(number) ? compactCurrencyFormatter.format(number) : '—';
};

const formatValue = (value, unit) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return unit === 'USD'
        ? formatCompactCurrency(value)
        : `${numberFormatter.format(Number(value))}${unit === '%' ? '%' : ` ${unit ?? ''}`}`;
};

const formatDate = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
};

const showToast = (message, isError = false) => {
    const toast = byId('toast');
    toast.textContent = message;
    toast.classList.toggle('is-error', isError);
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3800);
};

const fetchJson = async path => {
    const response = await fetch(path, {
        headers: { Accept: 'application/json' }
    });
    let body;
    try {
        body = await response.json();
    } catch {
        throw new Error('O servidor retornou uma resposta que não pôde ser lida.');
    }
    if (!response.ok) {
        throw new Error(body.message ?? body.mensagem ?? `A API respondeu com HTTP ${response.status}.`);
    }
    return body;
};

const setLoading = isLoading => {
    const button = byId('refresh-button');
    button.classList.toggle('is-loading', isLoading);
    button.disabled = isLoading;
    button.setAttribute('aria-busy', String(isLoading));
};

const updateTimeframeLabels = () => {
    document.querySelectorAll('.selected-timeframe').forEach(element => {
        element.textContent = state.timeFrame;
    });
};

const setMetricContent = (card, value, note, unavailable = false) => {
    const valueElement = card.querySelector('.metric-value');
    const noteElement = card.querySelector('small');
    if (valueElement) valueElement.textContent = value;
    if (noteElement) {
        noteElement.textContent = note;
        noteElement.classList.toggle('error-state', unavailable);
    }
};

const getAvailableData = category => category?.status === 'available' ? category.data : null;

const renderOverview = dashboard => {
    const cards = byId('overview-metrics').querySelectorAll('.metric-card');
    const bitcoin = dashboard.markets.find(item => item.symbolCode === 'BTCUSD');
    const gold = dashboard.markets.find(item => item.symbolCode === 'XAUUSD');
    const gdp = dashboard.economy.gdp;
    const inflation = dashboard.economy.inflation;
    const bitcoinData = getAvailableData(bitcoin);
    const goldData = getAvailableData(gold);
    const gdpData = getAvailableData(gdp);
    const inflationData = getAvailableData(inflation);

    setMetricContent(
        cards[0],
        bitcoinData ? formatCurrency(bitcoinData.closePrice) : '—',
        bitcoinData ? `Candle ${state.timeFrame} · concluído` : bitcoin?.error?.message ?? 'Cotação indisponível',
        !bitcoinData
    );
    setMetricContent(
        cards[1],
        goldData ? formatCurrency(goldData.closePrice) : '—',
        goldData ? `Candle ${state.timeFrame} · concluído` : gold?.error?.message ?? 'Cotação indisponível',
        !goldData
    );
    setMetricContent(
        cards[2],
        gdpData ? formatValue(gdpData.value, gdpData.unit) : '—',
        gdpData ? `Referência ${gdpData.referenceYear} · FMI` : gdp?.error?.message ?? 'Indicador indisponível',
        !gdpData
    );
    setMetricContent(
        cards[3],
        inflationData ? formatValue(inflationData.value, inflationData.unit) : '—',
        inflationData ? `Referência ${inflationData.referenceYear} · FMI` : inflation?.error?.message ?? 'Indicador indisponível',
        !inflationData
    );

    byId('overview-gdp-country').textContent = (countryNames[state.country] ?? state.country).toUpperCase();
    byId('last-updated').textContent = dashboard.metadata?.generatedAt
        ? `Atualizado ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(dashboard.metadata.generatedAt))}`
        : 'Dados carregados';
    renderPredictionPreview(dashboard.predictions);
    renderOverviewChart().catch(error => {
        showToast(`Não foi possível carregar o gráfico: ${error.message}`, true);
    });
};

const getRows = response => {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.candles)) return response.candles;
    if (Array.isArray(response?.history)) return response.history;
    if (Array.isArray(response?.prices)) return response.prices;
    return [];
};

const getCandleClose = candle => {
    const value = candle.closePrice ?? candle.ClosePrice ?? candle.close ?? candle.c;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const getCandleTime = candle =>
    candle.openTime ?? candle.OpenTime ?? candle.timestamp ?? candle.time ?? candle.date;

const getSortedCandles = response => getRows(response)
    .map(candle => ({
        time: getCandleTime(candle),
        close: getCandleClose(candle),
        open: Number(candle.openPrice ?? candle.OpenPrice ?? candle.open ?? candle.o),
        high: Number(candle.highPrice ?? candle.HighPrice ?? candle.high ?? candle.h),
        low: Number(candle.lowPrice ?? candle.LowPrice ?? candle.low ?? candle.l),
        volume: Number(candle.volume ?? candle.Volume ?? candle.v)
    }))
    .filter(candle => candle.close !== null)
    .sort((a, b) => new Date(a.time ?? 0) - new Date(b.time ?? 0));

const loadPriceHistory = async symbolCode => {
    const query = new URLSearchParams({ timeFrame: state.timeFrame });
    const response = await fetchJson(`/api/markets/${encodeURIComponent(symbolCode)}/history?${query}`);
    const candles = getSortedCandles(response);
    if (candles.length === 0) {
        throw new Error('A API não retornou candles históricos em formato reconhecido.');
    }
    return candles;
};

const renderChart = (canvasId, config, chartKey) => {
    const canvas = byId(canvasId);
    if (!globalThis.Chart) {
        canvas.hidden = true;
        if (!canvas.parentElement.querySelector('.chart-fallback')) {
            canvas.parentElement.append(makeElement('p', 'muted-copy chart-fallback', 'O gráfico precisa de conexão para carregar a biblioteca Chart.js.'));
        }
        return null;
    }
    canvas.hidden = false;
    canvas.parentElement.querySelector('.chart-fallback')?.remove();
    if (state.charts[chartKey]) state.charts[chartKey].destroy();
    state.charts[chartKey] = new globalThis.Chart(canvas, config);
    return state.charts[chartKey];
};

const chartOptions = (currency = true) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
        legend: {
            position: 'bottom',
            labels: { usePointStyle: true, boxWidth: 7, boxHeight: 7, padding: 18, color: '#78857d', font: { size: 10 } }
        },
        tooltip: {
            backgroundColor: '#173c30',
            padding: 10,
            displayColors: true,
            callbacks: {
                label: context => `${context.dataset.label}: ${currency ? formatCurrency(context.parsed.y) : `${numberFormatter.format(context.parsed.y)}%`}`
            }
        }
    },
    scales: {
        x: { grid: { display: false }, ticks: { color: '#9aa49d', maxTicksLimit: 7, maxRotation: 0, font: { size: 9 } } },
        y: { border: { display: false }, grid: { color: '#edf0eb' }, ticks: { color: '#9aa49d', maxTicksLimit: 5, font: { size: 9 }, callback: value => currency ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : numberFormatter.format(value) } }
    }
});

const createLineDataset = (label, candles, color) => ({
    label,
    data: candles.map(candle => candle.close),
    borderColor: color,
    backgroundColor: `${color}1c`,
    pointRadius: candles.length > 30 ? 0 : 2,
    pointHoverRadius: 4,
    borderWidth: 2,
    tension: .32,
    fill: true
});

const renderOverviewChart = async () => {
    const symbols = ['BTCUSD', 'XAUUSD'];
    const results = await Promise.allSettled(symbols.map(loadPriceHistory));
    const datasets = [];
    const errors = [];
    let labels = [];
    results.forEach((result, index) => {
        const symbolCode = symbols[index];
        let candles;
        if (result.status === 'fulfilled') {
            candles = result.value;
        } else {
            errors.push(`${symbolCode}: ${result.reason.message}`);
            const quote = state.dashboard.markets.find(item => item.symbolCode === symbolCode);
            const close = getAvailableData(quote)?.closePrice;
            candles = Number.isFinite(Number(close))
                ? [{ time: new Date().toISOString(), close: Number(close) }]
                : [];
        }
        if (candles.length > labels.length) {
            labels = candles.map(candle => {
                const date = new Date(candle.time);
                return Number.isNaN(date.getTime())
                    ? ''
                    : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit' }).format(date);
            });
        }
        if (candles.length > 0) {
            datasets.push(createLineDataset(
                symbolCode === 'BTCUSD' ? 'Bitcoin (USD)' : 'Ouro (USD)',
                candles,
                symbolCode === 'BTCUSD' ? '#3d8e69' : '#c79b42'
            ));
        }
    });
    if (datasets.length === 0) {
        byId('overview-chart-value').textContent = 'Sem série disponível';
        throw new Error(errors.join(' · ') || 'Não há dados para desenhar o gráfico.');
    }

    renderChart('overview-chart', {
        type: 'line',
        data: { labels, datasets },
        options: {
            ...chartOptions(),
            scales: {
                ...chartOptions().scales,
                y: { ...chartOptions().scales.y, type: 'logarithmic' }
            }
        }
    }, 'overview');
    const btc = state.dashboard.markets.find(item => item.symbolCode === 'BTCUSD');
    byId('overview-chart-value').textContent = formatCurrency(getAvailableData(btc)?.closePrice);
    byId('overview-chart-value').title = errors.length > 0 ? errors.join(' · ') : '';
};

const renderPredictionPreview = predictionGroups => {
    const container = byId('overview-predictions');
    container.replaceChildren();
    const markets = predictionGroups
        .flatMap(group => (group.markets ?? []).map(market => ({ ...market, symbolCode: group.symbolCode })))
        .slice(0, 3);
    if (markets.length === 0) {
        const issue = predictionGroups.find(group => group.error)?.error?.message;
        container.append(makeElement('p', issue ? 'error-state' : 'muted-copy', issue ?? 'Nenhum mercado ativo relacionado foi encontrado.'));
        return;
    }
    markets.forEach(market => {
        const row = makeElement('div', 'preview-row');
        const copy = makeElement('div');
        copy.append(
            makeElement('strong', '', market.question ?? 'Mercado sem título'),
            makeElement('small', '', `${market.symbolCode} · ${market.endDate ? `encerra ${formatDate(market.endDate)}` : 'mercado ativo'}`)
        );
        const prices = market.outcomePrices ?? [];
        const yesIndex = (market.outcomes ?? []).findIndex(outcome => ['yes', 'sim'].includes(String(outcome).toLowerCase()));
        const probability = Number(prices[yesIndex >= 0 ? yesIndex : 0]);
        row.append(copy, makeElement('span', 'preview-probability', Number.isFinite(probability) ? `${numberFormatter.format(probability * 100)}%` : '—'));
        container.append(row);
    });
};

const renderEconomyMetrics = dashboard => {
    const metrics = [
        { key: 'gdp', title: 'PIB nominal', accent: 'metric-card-dark' },
        { key: 'inflation', title: 'Inflação anual' }
    ];
    const container = byId('economy-metrics');
    container.replaceChildren();
    metrics.forEach(metric => {
        const entry = dashboard.economy[metric.key];
        const data = getAvailableData(entry);
        const card = makeElement('article', `metric-card ${metric.accent ?? ''}`.trim());
        const title = makeElement('p');
        title.append(document.createTextNode(metric.title), makeElement('span', '', data?.source ?? 'FMI'));
        card.append(
            title,
            makeElement('strong', 'metric-value', data ? formatValue(data.value, data.unit) : 'Indisponível'),
            makeElement('small', '', data
                ? `${data.country} · referência ${data.referenceYear}`
                : entry?.error?.message ?? 'Não foi possível consultar este indicador.')
        );
        container.append(card);
    });
};

const normalizeHistory = response => {
    const rows = Array.isArray(response?.data) ? response.data : [];
    return rows
        .map(row => ({ year: Number(row.year), value: Number(row.value) }))
        .filter(row => Number.isInteger(row.year) && Number.isFinite(row.value))
        .sort((a, b) => a.year - b.year);
};

const loadEconomyHistory = async () => {
    if (state.economyHistoryCountry === state.country) return;
    const container = byId('economy-metrics');
    const indicators = [
        { id: 'IMF.NGDPD', label: 'PIB nominal', color: '#3d8e69', scale: value => value / 1e12 },
        { id: 'IMF.PCPIPCH', label: 'Inflação', color: '#c79b42', scale: value => value }
    ];
    const results = await Promise.allSettled(indicators.map(indicator =>
        fetchJson(`/api/statistics/history/indicator/${encodeURIComponent(indicator.id)}/${encodeURIComponent(state.country)}`)
    ));
    const successful = [];
    const errors = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            const history = normalizeHistory(result.value);
            if (history.length > 0) successful.push({ ...indicators[index], history });
            else errors.push(`${indicators[index].label}: histórico vazio`);
        } else {
            errors.push(`${indicators[index].label}: ${result.reason.message}`);
        }
    });
    if (successful.length === 0) {
        container.append(makeElement('p', 'error-state', errors.join(' · ')));
        state.economyHistoryCountry = state.country;
        return;
    }
    const years = [...new Set(successful.flatMap(series => series.history.map(point => point.year)))].sort((a, b) => a - b);
    const datasets = successful.map(series => ({
        label: series.label,
        data: years.map(year => {
            const point = series.history.find(item => item.year === year);
            return point ? series.scale(point.value) : null;
        }),
        borderColor: series.color,
        backgroundColor: `${series.color}1c`,
        pointRadius: 2,
        borderWidth: 2,
        tension: .3,
        spanGaps: true,
        yAxisID: series.label === 'Inflação' ? 'yInflation' : 'yGdp'
    }));
    if (!globalThis.Chart) {
        const canvas = byId('economy-chart');
        canvas.hidden = true;
        if (!canvas.parentElement.querySelector('.chart-fallback')) {
            canvas.parentElement.append(makeElement('p', 'muted-copy chart-fallback', 'O gráfico precisa de conexão para carregar a biblioteca Chart.js.'));
        }
        return;
    }
    byId('economy-chart').hidden = false;
    byId('economy-chart').parentElement.querySelector('.chart-fallback')?.remove();
    if (state.charts.economy) state.charts.economy.destroy();
    state.charts.economy = new globalThis.Chart(byId('economy-chart'), {
        type: 'line',
        data: { labels: years, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, padding: 18, color: '#78857d', font: { size: 10 } } } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#9aa49d', font: { size: 9 } } },
                yGdp: { type: 'linear', position: 'left', title: { display: true, text: 'US$ trilhões', color: '#78857d', font: { size: 9 } }, grid: { color: '#edf0eb' }, ticks: { color: '#9aa49d', font: { size: 9 } } },
                yInflation: { type: 'linear', position: 'right', title: { display: true, text: 'Inflação (%)', color: '#78857d', font: { size: 9 } }, grid: { drawOnChartArea: false }, ticks: { color: '#9aa49d', font: { size: 9 } } }
            }
        }
    });
    state.economyHistoryCountry = state.country;
    if (errors.length > 0) showToast(`Histórico parcial: ${errors.join(' · ')}`, true);
};

const renderMarketHighlight = () => {
    const quote = state.dashboard?.markets.find(item => item.symbolCode === state.activeSymbol);
    const data = getAvailableData(quote);
    const container = byId('market-highlight');
    container.replaceChildren();
    const copy = makeElement('div');
    copy.append(
        makeElement('span', 'market-symbol', state.activeSymbol),
        makeElement('strong', '', data ? formatCurrency(data.closePrice) : 'Cotação indisponível'),
        makeElement('small', '', data
            ? `Candle concluído · ${formatDate(data.openTime)}`
            : quote?.error?.message ?? 'Atualize o dashboard para tentar novamente.')
    );
    const timeframe = makeElement('span', 'market-clock');
    timeframe.append(document.createTextNode('PERÍODO'), makeElement('b', 'selected-timeframe', state.timeFrame));
    container.append(copy, timeframe);
};

const renderMarketFacts = quote => {
    const data = getAvailableData(quote);
    const facts = [
        ['Abertura', data?.openPrice],
        ['Máxima', data?.highPrice],
        ['Mínima', data?.lowPrice],
        ['Volume', data?.volume]
    ];
    const container = byId('market-facts');
    container.replaceChildren();
    facts.forEach(([label, value]) => {
        const card = makeElement('div', 'fact-card');
        card.append(
            makeElement('span', '', label),
            makeElement('strong', '', value === undefined || value === null ? '—' : label === 'Volume' ? numberFormatter.format(Number(value)) : formatCurrency(value))
        );
        container.append(card);
    });
};

const loadMarketPage = async () => {
    if (!state.dashboard) return;
    const quote = state.dashboard.markets.find(item => item.symbolCode === state.activeSymbol);
    renderMarketHighlight();
    renderMarketFacts(quote);
    byId('market-chart-title').textContent = `${state.activeSymbol === 'BTCUSD' ? 'Bitcoin' : 'Ouro'} · ${state.activeSymbol}`;
    try {
        const candles = await loadPriceHistory(state.activeSymbol);
        byId('market-chart').parentElement.querySelector('.error-state')?.remove();
        renderChart('market-chart', {
            type: 'line',
            data: {
                labels: candles.map(candle => {
                    const date = new Date(candle.time);
                    return Number.isNaN(date.getTime())
                        ? ''
                        : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
                }),
                datasets: [createLineDataset(
                    `${state.activeSymbol} · USD`,
                    candles,
                    state.activeSymbol === 'BTCUSD' ? '#3d8e69' : '#c79b42'
                )]
            },
            options: chartOptions()
        }, 'market');
        byId('candle-count').textContent = `${candles.length} candles · ${state.timeFrame}`;
        const latest = candles[candles.length - 1];
        if (latest) {
            byId('market-highlight').querySelector('small').textContent = `Candle concluído · ${formatDate(latest.time)}`;
            byId('market-highlight').querySelector('strong').textContent = formatCurrency(latest.close);
        }
    } catch (error) {
        byId('candle-count').textContent = 'Histórico indisponível';
        const canvas = byId('market-chart');
        const existingMessage = canvas.parentElement.querySelector('.error-state');
        if (!existingMessage) canvas.parentElement.append(makeElement('p', 'error-state', error.message));
        showToast(`Histórico de ${state.activeSymbol} indisponível: ${error.message}`, true);
    }
};

const getYesProbability = market => {
    const outcomeIndex = (market.outcomes ?? []).findIndex(outcome => ['yes', 'sim'].includes(String(outcome).toLowerCase()));
    const price = Number((market.outcomePrices ?? [])[outcomeIndex >= 0 ? outcomeIndex : 0]);
    return Number.isFinite(price) ? price * 100 : null;
};

const renderPredictionCard = market => {
    const card = makeElement('article', 'panel prediction-card');
    const top = makeElement('div', 'prediction-card-top');
    top.append(makeElement('h3', '', market.question ?? 'Mercado sem título'));
    const probability = getYesProbability(market);
    if (probability !== null) {
        top.append(makeElement('span', 'preview-probability', `${numberFormatter.format(probability)}%`));
    }
    card.append(top);

    const meta = makeElement('div', 'market-meta');
    const endDate = market.endDate ? `Encerra ${formatDate(market.endDate)}` : 'Encerramento não informado';
    const volume = market.volume === null || market.volume === undefined ? 'Volume indisponível' : `Volume ${formatCurrency(market.volume)}`;
    const liquidity = market.liquidity === null || market.liquidity === undefined ? 'Liquidez indisponível' : `Liquidez ${formatCurrency(market.liquidity)}`;
    meta.append(
        makeElement('span', '', endDate),
        makeElement('span', '', volume),
        makeElement('span', '', liquidity)
    );
    card.append(meta);

    const outcomes = makeElement('div', 'outcome-prices');
    (market.outcomes ?? []).forEach((label, index) => {
        const price = Number((market.outcomePrices ?? [])[index]);
        outcomes.append(makeElement('span', 'outcome-chip', Number.isFinite(price)
            ? `${label} · ${numberFormatter.format(price * 100)}%`
            : label));
    });
    if (outcomes.childElementCount > 0) card.append(outcomes);

    const footer = makeElement('div', 'prediction-card-footer');
    footer.append(makeElement('span', 'muted-copy', `Mercado ${market.id ?? 'sem identificador'} · preço inicial da Gamma`));
    const quoteButton = makeElement('button', 'outline-button', 'Ver cotação CLOB');
    quoteButton.type = 'button';
    quoteButton.disabled = !market.id;
    quoteButton.dataset.marketId = market.id ?? '';
    footer.append(quoteButton);
    card.append(footer);
    return card;
};

const renderPredictionsPage = note => {
    const container = byId('prediction-list');
    container.replaceChildren();
    byId('prediction-results-note').textContent = note;
    if (state.predictionMarkets.length === 0) {
        container.append(makeElement('div', 'panel empty-state', 'Nenhum mercado relacionado foi encontrado.'));
        return;
    }
    state.predictionMarkets
        .slice(0, state.predictionVisibleCount)
        .forEach(market => container.append(renderPredictionCard(market)));
    if (state.predictionMarkets.length > state.predictionVisibleCount) {
        const moreButton = makeElement(
            'button',
            'outline-button show-more-button',
            `Mostrar mais (${state.predictionMarkets.length - state.predictionVisibleCount} restantes)`
        );
        moreButton.type = 'button';
        moreButton.dataset.showMore = 'true';
        container.append(moreButton);
    }
};

const renderPredictions = (markets, note = 'Mercados ativos relacionados aos ativos selecionados.') => {
    state.predictionMarkets = markets;
    state.predictionVisibleCount = 24;
    renderPredictionsPage(note);
};

const renderDashboardPredictions = dashboard => {
    const unavailable = dashboard.predictions.find(group => group.error);
    const markets = dashboard.predictions.flatMap(group => group.markets ?? []);
    const uniqueMarkets = [...new Map(markets.map(market => [market.conditionId ?? market.id ?? market.slug, market])).values()];
    renderPredictions(uniqueMarkets, unavailable
        ? `Algumas buscas falharam: ${unavailable.error.message}`
        : `${uniqueMarkets.length} mercados relacionados aos ativos selecionados.`);
};

const loadDashboard = async () => {
    setLoading(true);
    byId('api-status').textContent = 'Consultando serviços…';
    try {
        const query = new URLSearchParams({
            country: state.country,
            assets: 'XAUUSD,BTCUSD',
            timeFrame: state.timeFrame
        });
        const dashboard = await fetchJson(`/api/dashboard?${query}`);
        state.dashboard = dashboard;
        renderOverview(dashboard);
        renderEconomyMetrics(dashboard);
        renderDashboardPredictions(dashboard);
        const metadata = dashboard.metadata ?? {};
        byId('api-status').textContent = metadata.status === 'complete'
            ? 'Fontes atualizadas'
            : metadata.status === 'partial'
                ? `Atualização parcial · ${metadata.failedQueries ?? 0} falha(s)`
                : 'Fontes indisponíveis';
        byId('report-updated').textContent = metadata.generatedAt
            ? `Snapshot consultado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(metadata.generatedAt))} · status ${metadata.status}.`
            : 'Snapshot carregado.';
        renderPrintSummary(dashboard);
        if (metadata.status !== 'complete') showToast('Algumas fontes falharam. Os dados disponíveis foram mantidos no painel.', true);
        if (state.activePage === 'mercados') await loadMarketPage();
        if (state.activePage === 'economia') {
            state.economyHistoryCountry = null;
            await loadEconomyHistory();
        }
    } catch (error) {
        byId('api-status').textContent = 'Falha ao conectar à API';
        showToast(`Não foi possível carregar o dashboard: ${error.message}`, true);
        byId('overview-predictions').replaceChildren(makeElement('p', 'error-state', error.message));
    } finally {
        setLoading(false);
    }
};

const renderPrintSummary = dashboard => {
    const container = byId('report-print-summary');
    container.replaceChildren();
    const title = makeElement('h2', '', `Panorama Econômico · ${countryNames[state.country] ?? state.country}`);
    const time = makeElement('p', 'muted-copy', `Gerado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(dashboard.metadata.generatedAt))}. Status: ${dashboard.metadata.status}.`);
    const metrics = makeElement('div', 'print-metrics');
    const values = [
        ['PIB nominal', dashboard.economy.gdp],
        ['Inflação anual', dashboard.economy.inflation],
        ...dashboard.markets.map(item => [item.symbolCode, item])
    ];
    values.forEach(([label, item]) => {
        const data = item?.data;
        const value = item?.status === 'available'
            ? label === 'PIB nominal' || label === 'Inflação anual'
                ? `${formatValue(data.value, data.unit)} · ${data.referenceYear}`
                : formatCurrency(data.closePrice)
            : 'Indisponível';
        const block = makeElement('div', 'fact-card');
        block.append(makeElement('span', '', label), makeElement('strong', '', value));
        metrics.append(block);
    });
    container.append(title, time, metrics);
};

const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;

const createCsvReport = dashboard => {
    const rows = [['Categoria', 'Ativo', 'Indicador ou mercado', 'Valor', 'Unidade', 'Referência / encerramento', 'Status']];
    for (const [key, entry] of Object.entries(dashboard.economy ?? {})) {
        rows.push([
            'Economia',
            state.country,
            key,
            entry.data?.value,
            entry.data?.unit,
            entry.data?.referenceYear,
            entry.status
        ]);
    }
    for (const market of dashboard.markets ?? []) {
        rows.push([
            'Mercado',
            market.symbolCode,
            'Candle mais recente',
            market.data?.closePrice,
            'USD',
            market.data?.openTime,
            market.status
        ]);
    }
    for (const group of dashboard.predictions ?? []) {
        for (const prediction of group.markets ?? []) {
            rows.push([
                'Previsão',
                group.symbolCode,
                prediction.question,
                getYesProbability(prediction),
                '% implícita Yes',
                prediction.endDate,
                'available'
            ]);
        }
        if (group.error) {
            rows.push(['Previsão', group.symbolCode, group.error.message, '', '', '', 'unavailable']);
        }
    }
    return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
};

const downloadFile = (name, content, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = makeElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const exportReport = async format => {
    if (!state.dashboard) await loadDashboard();
    if (!state.dashboard) {
        showToast('O relatório não foi gerado porque não há dados disponíveis.', true);
        return;
    }
    const date = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
        downloadFile(
            `panorama-economico-${date}.json`,
            JSON.stringify(state.dashboard, null, 2),
            'application/json;charset=utf-8'
        );
    } else {
        downloadFile(
            `panorama-economico-${date}.csv`,
            `\uFEFF${createCsvReport(state.dashboard)}`,
            'text/csv;charset=utf-8'
        );
    }
    showToast(`Relatório ${format.toUpperCase()} gerado com os dados do último snapshot.`);
};

const setActivePage = page => {
    if (!document.querySelector(`[data-page-view="${page}"]`)) return;
    state.activePage = page;
    document.querySelectorAll('[data-page-view]').forEach(section => {
        section.hidden = section.dataset.pageView !== page;
    });
    document.querySelectorAll('.nav-link').forEach(button => {
        const active = button.dataset.page === page;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    const pageNames = {
        panorama: ['Panorama', 'SEU RESUMO ECONÔMICO'],
        economia: ['Economia', 'INDICADORES MACROECONÔMICOS'],
        mercados: ['Mercados', 'ATIVOS & COTAÇÕES'],
        previsoes: ['Previsões', 'EXPECTATIVAS DE MERCADO'],
        relatorios: ['Relatórios', 'DOCUMENTOS & EXPORTAÇÃO']
    };
    byId('page-title').textContent = pageNames[page][0];
    byId('page-eyebrow').textContent = pageNames[page][1];
    if (page === 'economia' && state.dashboard) loadEconomyHistory().catch(error => showToast(error.message, true));
    if (page === 'mercados' && state.dashboard) loadMarketPage();
    if (page === 'previsoes' && state.dashboard && !state.predictionSearch) renderDashboardPredictions(state.dashboard);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.querySelectorAll('.nav-link').forEach(button => {
    button.addEventListener('click', () => setActivePage(button.dataset.page));
});
document.querySelectorAll('[data-go-page]').forEach(button => {
    button.addEventListener('click', () => setActivePage(button.dataset.goPage));
});
byId('refresh-button').addEventListener('click', loadDashboard);
byId('country-select').addEventListener('change', event => {
    state.country = event.target.value;
    state.economyHistoryCountry = null;
    loadDashboard();
});
byId('timeframe-select').addEventListener('change', event => {
    state.timeFrame = event.target.value;
    updateTimeframeLabels();
    loadDashboard();
});
document.querySelectorAll('[data-market-symbol]').forEach(button => {
    button.addEventListener('click', () => {
        state.activeSymbol = button.dataset.marketSymbol;
        document.querySelectorAll('[data-market-symbol]').forEach(tab => {
            tab.classList.toggle('is-selected', tab === button);
        });
        if (state.dashboard) loadMarketPage();
    });
});
byId('prediction-search-form').addEventListener('submit', async event => {
    event.preventDefault();
    const search = byId('prediction-search').value.trim();
    state.predictionSearch = search;
    if (!search) {
        if (state.dashboard) renderDashboardPredictions(state.dashboard);
        return;
    }
    const query = new URLSearchParams({ search });
    byId('prediction-list').replaceChildren(makeElement('div', 'panel loading-card', 'Buscando mercados ativos…'));
    try {
        const markets = await fetchJson(`/api/predictions?${query}`);
        renderPredictions(markets, `${markets.length} resultado(s) para “${search}”.`);
    } catch (error) {
        byId('prediction-list').replaceChildren(makeElement('div', 'panel error-state', error.message));
    }
});
byId('prediction-list').addEventListener('click', async event => {
    if (event.target.closest('[data-show-more]')) {
        state.predictionVisibleCount += 24;
        renderPredictionsPage(`${state.predictionMarkets.length} mercados encontrados; mostrando até ${Math.min(state.predictionVisibleCount, state.predictionMarkets.length)}.`);
        return;
    }
    const button = event.target.closest('[data-market-id]');
    if (!button || button.disabled) return;
    const card = button.closest('.prediction-card');
    button.disabled = true;
    button.textContent = 'Consultando…';
    try {
        const details = await fetchJson(`/api/predictions/${encodeURIComponent(button.dataset.marketId)}`);
        const detail = makeElement('div', 'prediction-detail');
        details.outcomes.forEach(outcome => {
            detail.append(makeElement(
                'span',
                'outcome-chip',
                `${outcome.label}: ${numberFormatter.format(outcome.impliedProbabilityPercent)}% (${numberFormatter.format(outcome.price)})`
            ));
        });
        const disclaimer = makeElement('small', 'muted-copy', details.probabilityDisclaimer);
        card.querySelector('.prediction-detail')?.remove();
        card.querySelector('.prediction-card-footer').before(detail);
        card.querySelector('.prediction-card-footer').append(disclaimer);
        button.textContent = 'Cotação atualizada';
        showToast('Preços CLOB carregados. A probabilidade é implícita, não garantida.');
    } catch (error) {
        button.disabled = false;
        button.textContent = 'Tentar cotação novamente';
        showToast(`Não foi possível consultar a CLOB: ${error.message}`, true);
    }
});
document.querySelectorAll('[data-export]').forEach(button => {
    button.addEventListener('click', () => exportReport(button.dataset.export));
});
byId('print-report').addEventListener('click', async () => {
    setActivePage('relatorios');
    if (!state.dashboard) await loadDashboard();
    if (state.dashboard) window.print();
});

byId('today-date').textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
}).format(new Date()).toLocaleUpperCase('pt-BR');
updateTimeframeLabels();
loadDashboard();
