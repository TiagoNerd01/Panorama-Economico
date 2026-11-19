import { getLatestRealMarketPrice } from './realMarketService.js';
import { getRelevantPredictionMarkets } from './polyMarketService.js';
import { getMarketOutcomePrices } from './clobService.js';

export class MarketComparisonError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

const extractUsdTarget = question => {
    const dollarAmount = question.match(/\$\s*([\d,]+(?:\.\d+)?)(\s*[kmb])?\b/i);
    const abbreviatedAmount = dollarAmount
        ? null
        : question.match(/\b(?:bitcoin|btc)\b[^\d]{0,40}([\d,.]+)\s*([kmb])\b/i);
    const match = dollarAmount ?? abbreviatedAmount;
    if (!match) {
        return null;
    }

    const amount = Number(match[1].replace(/,/g, ''));
    const multiplier = match[2]?.trim().toLowerCase();
    const value = amount * (
        multiplier === 'k' ? 1000
            : multiplier === 'm' ? 1000000
                : multiplier === 'b' ? 1000000000
                    : 1
    );
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }

    const normalizedQuestion = question.toLowerCase();
    const relation = /\b(?:below|under|dip|fall|drop|less than)\b/.test(normalizedQuestion)
        ? 'at_or_below'
        : /\b(?:above|over|reach|hit|surpass|exceed|higher than|rise to)\b/.test(normalizedQuestion)
            ? 'at_or_above'
            : 'threshold';

    return { value, currency: 'USD', relation };
};

const numericMetric = value => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const getBitcoinMarketTarget = markets => {
    const candidates = markets
        .filter(market =>
            market.topics?.includes('bitcoin') &&
            /\bbitcoin\b|\bbtc\b/i.test(market.question ?? '') &&
            market.acceptingOrders !== false &&
            Array.isArray(market.outcomes) &&
            market.outcomes.some(outcome => String(outcome).toLowerCase() === 'yes') &&
            market.outcomes.some(outcome => String(outcome).toLowerCase() === 'no')
        )
        .map(market => ({
            market,
            target: extractUsdTarget(market.question)
        }))
        .filter(candidate => candidate.target !== null)
        .sort((a, b) =>
            numericMetric(b.market.liquidity) - numericMetric(a.market.liquidity) ||
            numericMetric(b.market.volume) - numericMetric(a.market.volume)
        );

    return candidates[0] ?? null;
};

export const getBitcoinMarketComparison = async (timeFrame = 'H1') => {
    const [quote, markets] = await Promise.all([
        getLatestRealMarketPrice('BTCUSD', timeFrame),
        getRelevantPredictionMarkets('bitcoin')
    ]);

    const selection = getBitcoinMarketTarget(markets);
    if (!selection) {
        throw new MarketComparisonError(
            'Não foi encontrado um mercado ativo de Bitcoin com meta de preço e resultados Yes/No.',
            404,
            'PREDICTION_MARKET_NOT_FOUND'
        );
    }

    const currentPrice = Number(quote.closePrice);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        throw new MarketComparisonError(
            'A RealMarketAPI não retornou um preço de fechamento válido.',
            502,
            'INVALID_REALMARKET_PRICE'
        );
    }

    const outcomes = await getMarketOutcomePrices(selection.market);
    const positiveOutcome = outcomes.find(outcome => outcome.polarity === 'positive');
    if (!positiveOutcome) {
        throw new MarketComparisonError(
            'O mercado selecionado não possui um resultado positivo identificável.',
            502,
            'POSITIVE_OUTCOME_NOT_FOUND'
        );
    }

    const distanceUsd = selection.target.value - currentPrice;
    const distancePercent = Number(((distanceUsd / currentPrice) * 100).toFixed(2));

    return {
        asset: {
            symbolCode: 'BTCUSD',
            name: 'Bitcoin',
            currency: 'USD',
            latestCompletedCandle: {
                timeFrame,
                closePrice: currentPrice,
                openTime: quote.openTime ?? null
            }
        },
        prediction: {
            marketId: selection.market.id,
            question: selection.market.question,
            target: selection.target,
            probability: {
                outcome: positiveOutcome.label,
                price: positiveOutcome.price,
                percent: positiveOutcome.impliedProbabilityPercent,
                side: positiveOutcome.side
            },
            outcomes,
            endDate: selection.market.endDate,
            volume: selection.market.volume,
            liquidity: selection.market.liquidity
        },
        comparison: {
            targetDistanceUsd: Number(distanceUsd.toFixed(2)),
            targetDistancePercent: distancePercent,
            currentPriceRelation: distanceUsd > 0
                ? 'below_target'
                : distanceUsd < 0
                    ? 'above_target'
                    : 'at_target'
        },
        disclaimer: 'A cotação é a probabilidade implícita do lado BUY no Polymarket, não uma previsão garantida.'
    };
};
