import {
    getPredictionMarketById,
    getRelevantPredictionMarkets,
    PolymarketApiError
} from '../services/polyMarketService.js';
import {
    ClobApiError,
    getMarketOutcomePriceHistory,
    getMarketOutcomePrices
} from '../services/clobService.js';

const MARKET_ID_PATTERN = /^\d{1,20}$/;
const PROBABILITY_DISCLAIMER = 'O preço representa uma probabilidade implícita de mercado, não uma previsão garantida.';

const getMarketMetadata = market => ({
    id: market.id,
    conditionId: market.conditionId,
    slug: market.slug,
    question: market.question,
    volume: market.volume,
    liquidity: market.liquidity,
    endDate: market.endDate
});

const validateMarketId = (id, res) => {
    if (!MARKET_ID_PATTERN.test(id)) {
        res.status(400).json({
            error: 'INVALID_MARKET_ID',
            message: 'id deve ser o identificador numérico do mercado Polymarket.'
        });
        return false;
    }

    return true;
};

const sendPredictionError = (res, error) => {
    const knownError = error instanceof PolymarketApiError || error instanceof ClobApiError;
    const statusCode = knownError ? error.statusCode : 502;
    const code = knownError ? error.code : 'POLYMARKET_API_ERROR';

    console.error(error.message);
    return res.status(statusCode).json({ error: code, message: error.message });
};

export const predictionController = async (req, res) => {
    const search = req.query.search;
    if (
        search !== undefined &&
        (typeof search !== 'string' || search.trim().length === 0 || search.trim().length > 100)
    ) {
        return res.status(400).json({
            error: 'INVALID_SEARCH',
            message: 'search deve ser um texto entre 1 e 100 caracteres.'
        });
    }

    try {
        const markets = await getRelevantPredictionMarkets(search?.trim());
        return res.status(200).json(markets);
    } catch (error) {
        console.error(error.message);
        return res.status(502).json({
            error: 'POLYMARKET_API_ERROR',
            message: error.message
        });
    }
};

export const predictionDetailsController = async (req, res) => {
    if (!validateMarketId(req.params.id, res)) return;

    try {
        const market = await getPredictionMarketById(req.params.id);
        const outcomes = await getMarketOutcomePrices(market);
        return res.status(200).json({
            ...getMarketMetadata(market),
            priceSide: 'BUY',
            probabilityDisclaimer: PROBABILITY_DISCLAIMER,
            outcomes
        });
    } catch (error) {
        return sendPredictionError(res, error);
    }
};

export const predictionHistoryController = async (req, res) => {
    if (!validateMarketId(req.params.id, res)) return;

    try {
        const market = await getPredictionMarketById(req.params.id);
        const outcomes = await getMarketOutcomePriceHistory(market);
        return res.status(200).json({
            ...getMarketMetadata(market),
            interval: '1d',
            fidelity: 1440,
            probabilityDisclaimer: PROBABILITY_DISCLAIMER,
            outcomes
        });
    } catch (error) {
        return sendPredictionError(res, error);
    }
};