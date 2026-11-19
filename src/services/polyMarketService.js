const GAMMA_BASE_URL = 'https://gamma-api.polymarket.com';
const ACTIVE_MARKETS_LIMIT = 50;
const SEARCH_LIMIT_PER_TYPE = 20;

export class PolymarketApiError extends Error {
    constructor(message, statusCode = 502, code = 'POLYMARKET_API_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

const TOPICS = [
    {
        id: 'bitcoin',
        aliases: ['bitcoin', 'btc'],
        searchQuery: 'bitcoin',
        pattern: /\bbitcoin\b|\bbtc\b/i
    },
    {
        id: 'gold',
        aliases: ['gold', 'gold price', 'ouro', 'xau', 'xauusd'],
        searchQuery: 'gold price',
        pattern: /\bgold\b|\bxauusd\b/i
    },
    {
        id: 'inflation',
        aliases: ['inflation', 'inflacao', 'cpi', 'pce'],
        searchQuery: 'inflation',
        pattern: /\binflation\b|\bcpi\b|\bpce\b|consumer price index/i
    },
    {
        id: 'interest_rates',
        aliases: ['interest', 'interest rate', 'interest rates', 'juros', 'fed', 'fomc', 'rate', 'rates'],
        searchQuery: 'Fed rate',
        pattern: /\binterest rates?\b|\bfederal reserve\b|\bfed\b|\bfomc\b|\brate cuts?\b|\brate hikes?\b|\bcentral bank\b|\becb\b/i
    }
];

const normalizeText = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const getSearchTopics = search => {
    const normalizedSearch = normalizeText(search);
    return TOPICS.filter(topic =>
        topic.aliases.some(alias => {
            const escapedAlias = normalizeText(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`\\b${escapedAlias}\\b`, 'i').test(normalizedSearch);
        })
    );
};

const requestJson = async url => {
    let response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch {
        throw new PolymarketApiError(
            'Não foi possível conectar à Gamma API do Polymarket.'
        );
    }

    if (!response.ok) {
        const statusCode = response.status === 404
            ? 404
            : response.status === 429
                ? 503
                : 502;
        const code = response.status === 404
            ? 'POLYMARKET_MARKET_NOT_FOUND'
            : response.status === 429
                ? 'POLYMARKET_RATE_LIMIT'
                : 'POLYMARKET_API_ERROR';
        throw new PolymarketApiError(
            `A Gamma API do Polymarket respondeu com HTTP ${response.status}.`,
            statusCode,
            code
        );
    }

    try {
        return await response.json();
    } catch {
        throw new PolymarketApiError('A Gamma API do Polymarket retornou uma resposta inválida.');
    }
};

const getActiveMarketPage = async () => {
    const url = new URL('/markets', GAMMA_BASE_URL);
    url.searchParams.set('active', 'true');
    url.searchParams.set('closed', 'false');
    url.searchParams.set('limit', String(ACTIVE_MARKETS_LIMIT));
    url.searchParams.set('offset', '0');

    const markets = await requestJson(url);
    if (!Array.isArray(markets)) {
        throw new Error('A Gamma API retornou uma lista de mercados inválida.');
    }

    return markets;
};

const searchActiveEvents = async query => {
    const url = new URL('/public-search', GAMMA_BASE_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('events_status', 'active');
    url.searchParams.set('limit_per_type', String(SEARCH_LIMIT_PER_TYPE));
    url.searchParams.set('keep_closed_markets', '0');
    url.searchParams.set('search_profiles', 'false');
    url.searchParams.set('search_tags', 'false');

    const response = await requestJson(url);
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
        throw new Error('A Gamma API retornou uma resposta de busca inválida.');
    }
    if (response.events !== undefined && response.events !== null && !Array.isArray(response.events)) {
        throw new Error('A Gamma API retornou uma lista de eventos inválida.');
    }

    return response.events ?? [];
};

const isOpenMarket = market =>
    market.active === true &&
    market.closed !== true &&
    market.archived !== true;

const getMarketTopics = (market, eventTitle) => {
    const primaryText = normalizeText([
        eventTitle,
        market.question
    ].filter(Boolean).join(' '));
    const description = normalizeText(market.description);

    const matchesText = text => TOPICS
        .filter(topic => topic.pattern.test(text))
        .filter(topic => topic.id !== 'gold' || !/\bgold cards?\b/i.test(text))
        .map(topic => topic.id);

    const primaryTopics = matchesText(primaryText);
    return primaryTopics.length > 0 ? primaryTopics : matchesText(description);
};

const parseArrayField = (value, fieldName) => {
    if (value === undefined || value === null) {
        return [];
    }
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value !== 'string') {
        throw new Error(`Campo ${fieldName} inválido na resposta da Gamma API.`);
    }

    let parsed;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new Error(`Campo ${fieldName} inválido na resposta da Gamma API.`);
    }
    if (!Array.isArray(parsed)) {
        throw new Error(`Campo ${fieldName} inválido na resposta da Gamma API.`);
    }

    return parsed;
};

const normalizeMarket = (market, event) => ({
    id: market.id ?? null,
    conditionId: market.conditionId ?? null,
    slug: market.slug ?? null,
    question: market.question ?? event.title ?? null,
    event: event.title
        ? { title: event.title, slug: event.slug ?? null }
        : null,
    topics: getMarketTopics(market, event.title),
    outcomes: parseArrayField(market.outcomes, 'outcomes'),
    outcomePrices: parseArrayField(market.outcomePrices, 'outcomePrices'),
    clobTokenIds: parseArrayField(market.clobTokenIds, 'clobTokenIds'),
    positionIds: parseArrayField(market.positionIds, 'positionIds'),
    endDate: market.endDate ?? null,
    category: market.category ?? null,
    volume: market.volumeNum ?? market.volume ?? null,
    liquidity: market.liquidityNum ?? market.liquidity ?? null,
    active: market.active === true,
    closed: market.closed === true,
    acceptingOrders: market.acceptingOrders ?? null,
    version: market.version ?? null
});

export const getPredictionMarketById = async id => {
    const url = new URL(`/markets/${encodeURIComponent(id)}`, GAMMA_BASE_URL);
    const market = await requestJson(url);
    if (!market || typeof market !== 'object' || Array.isArray(market)) {
        throw new PolymarketApiError('A Gamma API retornou um mercado inválido.');
    }

    return normalizeMarket(market, market.events?.[0] ?? {});
};

const matchesSearch = (market, search, searchTopics) => {
    if (!search) {
        return true;
    }
    if (searchTopics.length > 0) {
        return searchTopics.some(topic => market.topics.includes(topic.id));
    }

    const searchableText = normalizeText([
        market.question,
        market.event?.title,
        market.category
    ].filter(Boolean).join(' '));
    const terms = normalizeText(search).split(/\s+/).filter(Boolean);
    return terms.every(term => searchableText.includes(term));
};

export const getRelevantPredictionMarkets = async search => {
    const searchTopics = search ? getSearchTopics(search) : [];
    const topicsToSearch = searchTopics.length > 0
        ? searchTopics
        : search
            ? [{ searchQuery: search }]
            : TOPICS;

    const [activeMarkets, ...eventGroups] = await Promise.all([
        getActiveMarketPage(),
        ...topicsToSearch.map(topic => searchActiveEvents(topic.searchQuery))
    ]);

    const candidates = activeMarkets.map(market => ({
        market,
        event: market.events?.[0] ?? {}
    }));

    for (const events of eventGroups) {
        for (const event of events) {
            if (event.markets !== undefined && event.markets !== null && !Array.isArray(event.markets)) {
                throw new Error('A Gamma API retornou uma lista de mercados de evento inválida.');
            }
            for (const market of event.markets ?? []) {
                candidates.push({ market, event });
            }
        }
    }

    const results = new Map();
    for (const { market, event } of candidates) {
        if (!market || typeof market !== 'object' || !isOpenMarket(market)) {
            continue;
        }

        const topics = getMarketTopics(market, event.title);
        if (topics.length === 0) {
            continue;
        }

        const normalized = normalizeMarket(market, event);
        if (!matchesSearch(normalized, search, searchTopics)) {
            continue;
        }

        const key = normalized.conditionId || normalized.id || normalized.slug;
        if (!key) {
            throw new Error('A Gamma API retornou um mercado sem identificador.');
        }
        if (!results.has(key)) {
            results.set(key, normalized);
        }
    }

    return [...results.values()];
};