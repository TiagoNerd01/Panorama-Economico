const CLOB_BASE_URL = 'https://clob.polymarket.com';
const PRICE_SIDE = 'BUY';
const HISTORY_INTERVAL = '1d';
const HISTORY_FIDELITY_MINUTES = 1440;

export class ClobApiError extends Error {
    constructor(message, statusCode = 502, code = 'CLOB_API_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

const requestJson = async (path, parameters) => {
    const url = new URL(path, CLOB_BASE_URL);
    for (const [name, value] of Object.entries(parameters)) {
        url.searchParams.set(name, String(value));
    }

    let response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch {
        throw new ClobApiError('Não foi possível conectar à CLOB API do Polymarket.');
    }

    if (!response.ok) {
        const statusCode = response.status === 404
            ? 404
            : response.status === 429
                ? 503
                : 502;
        const code = response.status === 404
            ? 'CLOB_DATA_NOT_FOUND'
            : response.status === 429
                ? 'CLOB_RATE_LIMIT'
                : 'CLOB_API_ERROR';
        throw new ClobApiError(
            `A CLOB API do Polymarket respondeu com HTTP ${response.status}.`,
            statusCode,
            code
        );
    }

    try {
        return await response.json();
    } catch {
        throw new ClobApiError('A CLOB API do Polymarket retornou uma resposta inválida.');
    }
};

const getOutcomeTokenPairs = market => {
    if (!Array.isArray(market.outcomes) || market.outcomes.length === 0) {
        throw new ClobApiError(
            'O mercado não contém resultados para associar aos tokens.',
            502,
            'INVALID_MARKET_OUTCOMES'
        );
    }

    const tokenIds = market.version === 'v2'
        ? market.positionIds
        : market.version === 'v1'
            ? market.clobTokenIds
            : null;

    if (!Array.isArray(tokenIds) || tokenIds.length !== market.outcomes.length) {
        throw new ClobApiError(
            'Os identificadores de token não correspondem aos resultados do mercado.',
            422,
            'OUTCOME_TOKEN_IDS_UNAVAILABLE'
        );
    }

    return market.outcomes.map((label, index) => {
        const tokenId = tokenIds[index];
        if (typeof label !== 'string' || typeof tokenId !== 'string' || !tokenId) {
            throw new ClobApiError(
                'A Gamma API retornou um resultado ou token inválido.',
                502,
                'INVALID_MARKET_OUTCOMES'
            );
        }

        const normalizedLabel = label.trim().toLowerCase();
        const polarity = ['yes', 'true', 'sim', 'positive', 'positivo'].includes(normalizedLabel)
            ? 'positive'
            : ['no', 'false', 'não', 'nao', 'negative', 'negativo'].includes(normalizedLabel)
                ? 'negative'
                : null;

        return { label, polarity, tokenId };
    });
};

const normalizePrice = value => {
    if (value === undefined || value === null || value === '') {
        throw new ClobApiError(
            'A CLOB API não retornou um preço para o token.',
            502,
            'INVALID_CLOB_PRICE'
        );
    }

    const price = Number(value);
    if (!Number.isFinite(price) || price < 0 || price > 1) {
        throw new ClobApiError(
            'A CLOB API retornou um preço fora do intervalo de 0 a 1.',
            502,
            'INVALID_CLOB_PRICE'
        );
    }

    return price;
};

const toProbabilityPercent = price => Number((price * 100).toFixed(2));

export const getMarketOutcomePrices = async market => {
    const outcomes = getOutcomeTokenPairs(market);
    return Promise.all(outcomes.map(async outcome => {
        const response = await requestJson('/price', {
            token_id: outcome.tokenId,
            side: PRICE_SIDE
        });
        if (!response || typeof response !== 'object') {
            throw new ClobApiError('A CLOB API retornou um preço inválido.', 502, 'INVALID_CLOB_PRICE');
        }

        const price = normalizePrice(response.price);
        return {
            ...outcome,
            side: PRICE_SIDE,
            price,
            impliedProbabilityPercent: toProbabilityPercent(price)
        };
    }));
};

export const getMarketOutcomePriceHistory = async market => {
    const outcomes = getOutcomeTokenPairs(market);
    return Promise.all(outcomes.map(async outcome => {
        const response = await requestJson('/prices-history', {
            market: outcome.tokenId,
            interval: HISTORY_INTERVAL,
            fidelity: HISTORY_FIDELITY_MINUTES
        });
        if (!response || !Array.isArray(response.history)) {
            throw new ClobApiError(
                'A CLOB API retornou um histórico inválido.',
                502,
                'INVALID_CLOB_HISTORY'
            );
        }

        const history = response.history.map(point => {
            const timestamp = Number(point.t);
            const price = normalizePrice(point.p);
            if (!Number.isInteger(timestamp) || timestamp <= 0) {
                throw new ClobApiError(
                    'A CLOB API retornou uma data inválida no histórico.',
                    502,
                    'INVALID_CLOB_HISTORY'
                );
            }

            return {
                timestamp: new Date(timestamp * 1000).toISOString(),
                price,
                impliedProbabilityPercent: toProbabilityPercent(price)
            };
        });

        return {
            ...outcome,
            history
        };
    }));
};
