import {
    getLatestRealMarketPrice,
    getRecentRealMarketCandles,
    getRealMarketHistory,
    RealMarketApiError
} from '../services/realMarketService.js';
import {
    getBitcoinMarketComparison,
    MarketComparisonError
} from '../services/marketComparisonService.js';

const VALID_TIMEFRAMES = new Set(['M1', 'M5', 'M15', 'H1', 'H4', 'D1']);
const SYMBOL_PATTERN = /^[A-Z0-9]{2,12}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const validateSymbol = (value, res) => {
    const symbolCode = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!SYMBOL_PATTERN.test(symbolCode)) {
        res.status(400).json({
            error: 'INVALID_SYMBOL',
            message: 'O símbolo deve conter de 2 a 12 letras ou números.'
        });
        return null;
    }

    return symbolCode;
};

const validateTimeFrame = (value, res) => {
    const timeFrame = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!VALID_TIMEFRAMES.has(timeFrame)) {
        res.status(400).json({
            error: 'INVALID_TIMEFRAME',
            message: 'timeFrame deve ser M1, M5, M15, H1, H4 ou D1.'
        });
        return null;
    }

    return timeFrame;
};

const validateTimestamp = (value, name, res) => {
    if (
        typeof value !== 'string' ||
        !ISO_TIMESTAMP_PATTERN.test(value) ||
        !Number.isFinite(Date.parse(value))
    ) {
        res.status(400).json({
            error: 'INVALID_TIMESTAMP',
            message: `${name} deve ser uma data ISO 8601 com fuso horário.`
        });
        return null;
    }

    return value;
};

const sendMarketError = (res, error) => {
    const statusCode = error instanceof RealMarketApiError
        ? error.statusCode
        : 502;
    const code = error instanceof RealMarketApiError
        ? error.code
        : 'REALMARKET_API_ERROR';

    console.error(error.message);
    return res.status(statusCode).json({ error: code, message: error.message });
};

export const marketPriceController = async (req, res) => {
    const symbolCode = validateSymbol(req.params.symbol, res);
    if (!symbolCode) return;

    const timeFrame = validateTimeFrame(req.query.timeFrame, res);
    if (!timeFrame) return;

    try {
        const price = await getLatestRealMarketPrice(symbolCode, timeFrame);
        return res.status(200).json(price);
    } catch (error) {
        return sendMarketError(res, error);
    }
};

export const marketHistoryController = async (req, res) => {
    const symbolCode = validateSymbol(req.params.symbol, res);
    if (!symbolCode) return;

    const timeFrame = validateTimeFrame(req.query.timeFrame, res);
    if (!timeFrame) return;

    try {
        const candles = await getRecentRealMarketCandles(symbolCode, timeFrame);
        return res.status(200).json(candles);
    } catch (error) {
        return sendMarketError(res, error);
    }
};

export const marketCandleController = async (req, res) => {
    const symbolCode = validateSymbol(req.params.symbol, res);
    if (!symbolCode) return;

    if (
        req.query.timeFrame !== undefined &&
        (typeof req.query.timeFrame !== 'string' ||
            req.query.timeFrame.trim().toUpperCase() !== 'H1')
    ) {
        return res.status(400).json({
            error: 'UNSUPPORTED_HISTORY_TIMEFRAME',
            message: 'O histórico por intervalo de datas está disponível somente em H1.'
        });
    }

    const startTime = validateTimestamp(req.query.startTime, 'startTime', res);
    if (!startTime) return;

    const endTime = validateTimestamp(req.query.endTime, 'endTime', res);
    if (!endTime) return;

    if (Date.parse(startTime) >= Date.parse(endTime)) {
        return res.status(400).json({
            error: 'INVALID_DATE_RANGE',
            message: 'startTime deve ser anterior a endTime.'
        });
    }

    const pageNumber = req.query.pageNumber === undefined
        ? undefined
        : Number(req.query.pageNumber);
    const pageSize = req.query.pageSize === undefined
        ? undefined
        : Number(req.query.pageSize);

    if (
        (pageNumber !== undefined &&
            (!Number.isInteger(pageNumber) || pageNumber < 1)) ||
        (pageSize !== undefined &&
            (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000))
    ) {
        return res.status(400).json({
            error: 'INVALID_PAGINATION',
            message: 'pageNumber deve ser inteiro positivo e pageSize deve estar entre 1 e 1000.'
        });
    }

    try {
        const history = await getRealMarketHistory(
            symbolCode,
            startTime,
            endTime,
            pageNumber,
            pageSize
        );
        return res.status(200).json(history);
    } catch (error) {
        return sendMarketError(res, error);
    }
};

export const marketComparisonController = async (req, res) => {
    const symbolCode = validateSymbol(req.params.symbol, res);
    if (!symbolCode) return;

    if (symbolCode !== 'BTCUSD') {
        return res.status(400).json({
            error: 'UNSUPPORTED_COMPARISON_SYMBOL',
            message: 'A comparação de previsões está disponível inicialmente para BTCUSD.'
        });
    }

    const timeFrame = req.query.timeFrame === undefined
        ? 'H1'
        : validateTimeFrame(req.query.timeFrame, res);
    if (!timeFrame) return;

    try {
        const comparison = await getBitcoinMarketComparison(timeFrame);
        return res.status(200).json(comparison);
    } catch (error) {
        const knownError =
            error instanceof RealMarketApiError ||
            error instanceof MarketComparisonError ||
            Number.isInteger(error.statusCode);
        const statusCode = knownError ? error.statusCode : 502;
        const code = typeof error.code === 'string'
            ? error.code
            : 'MARKET_COMPARISON_ERROR';

        console.error(error.message);
        return res.status(statusCode).json({ error: code, message: error.message });
    }
};