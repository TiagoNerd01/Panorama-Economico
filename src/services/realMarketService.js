const BASE_URL = 'https://api.realmarketapi.com/api/v1';

export class RealMarketApiError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

const getApiKey = () => {
    const apiKey = process.env.REALMARKET_API_KEY?.trim();
    if (!apiKey) {
        throw new RealMarketApiError(
            'Configure REALMARKET_API_KEY no arquivo .env.',
            500,
            'MISSING_API_KEY'
        );
    }

    return apiKey;
};

const requestJson = async (path, parameters = {}, authenticated = true) => {
    const url = new URL(`${BASE_URL}${path}`);
    if (authenticated) {
        url.searchParams.set('apiKey', getApiKey());
    }
    for (const [name, value] of Object.entries(parameters)) {
        if (value !== undefined && value !== null) {
            url.searchParams.set(name, String(value));
        }
    }

    let response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch {
        throw new RealMarketApiError(
            'Não foi possível conectar à RealMarketAPI.',
            502,
            'REALMARKET_CONNECTION_ERROR'
        );
    }

    if (!response.ok) {
        let providerErrorCode;
        try {
            const errorBody = await response.json();
            providerErrorCode = errorBody.errors
                ?.find(error => typeof error.errorCode === 'string')
                ?.errorCode;
        } catch {
            providerErrorCode = undefined;
        }

        if (providerErrorCode === 'ERR_0010_NOT_SUPPORT_HISTORICAL') {
            throw new RealMarketApiError(
                'Seu plano RealMarketAPI não permite consultas históricas por intervalo de datas.',
                403,
                'REALMARKET_HISTORY_NOT_ALLOWED'
            );
        }

        if (providerErrorCode === 'ERR_0007_INVALID_TIME_FRAME') {
            throw new RealMarketApiError(
                'O período informado não está disponível para esta chave na RealMarketAPI.',
                403,
                'REALMARKET_TIMEFRAME_NOT_ALLOWED'
            );
        }

        const statusCode = response.status === 400
            ? 400
            : response.status === 403
                ? 403
                : response.status === 429
                    ? 503
                    : 502;
        const code = response.status === 400
            ? 'REALMARKET_INVALID_REQUEST'
            : response.status === 403
                ? 'REALMARKET_ACCESS_DENIED'
                : response.status === 429
                    ? 'REALMARKET_RATE_LIMIT'
                    : 'REALMARKET_API_ERROR';
        throw new RealMarketApiError(
            `A RealMarketAPI respondeu com HTTP ${response.status}.`,
            statusCode,
            code
        );
    }

    try {
        return await response.json();
    } catch {
        throw new RealMarketApiError(
            'A RealMarketAPI retornou uma resposta inválida.',
            502,
            'INVALID_REALMARKET_RESPONSE'
        );
    }
};

export const getRealMarketSymbols = async () => {
    const response = await requestJson('/symbol', {}, false);
    if (!Array.isArray(response.data)) {
        throw new RealMarketApiError(
            'A resposta de símbolos da RealMarketAPI possui um formato inválido.',
            502,
            'INVALID_REALMARKET_RESPONSE'
        );
    }

    return response.data;
};

export const getRealMarketAccount = async () => {
    const response = await requestJson('/me');
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
        throw new RealMarketApiError(
            'A resposta da conta RealMarketAPI possui um formato inválido.',
            502,
            'INVALID_REALMARKET_RESPONSE'
        );
    }

    return response;
};

export const testRealMarketConnection = async () => {
    const [symbols, account] = await Promise.all([
        getRealMarketSymbols(),
        getRealMarketAccount()
    ]);

    return { symbols, account };
};

export const getLatestRealMarketPrice = (symbolCode, timeFrame) =>
    requestJson('/price', { symbolCode, timeFrame });

export const getRecentRealMarketCandles = (symbolCode, timeFrame) =>
    requestJson('/candle', { symbolCode, timeFrame });

export const getRealMarketHistory = (
    symbolCode,
    startTime,
    endTime,
    pageNumber,
    pageSize
) => requestJson('/history', {
    symbolCode,
    startTime,
    endTime,
    pageNumber,
    pageSize
});