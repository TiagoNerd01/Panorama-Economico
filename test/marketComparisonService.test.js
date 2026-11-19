import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
    getBitcoinMarketComparison,
    MarketComparisonError
} from '../src/services/marketComparisonService.js';

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.REALMARKET_API_KEY;

afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
        delete process.env.REALMARKET_API_KEY;
    } else {
        process.env.REALMARKET_API_KEY = originalApiKey;
    }
});

const jsonResponse = body => ({
    ok: true,
    status: 200,
    json: async () => body
});

const predictionMarket = (id, target, liquidity) => ({
    id,
    conditionId: `condition-${id}`,
    slug: id,
    question: `Will Bitcoin reach $${target.toLocaleString('en-US')} by December 31, 2026?`,
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.68","0.32"]',
    clobTokenIds: `["yes-${id}","no-${id}"]`,
    positionIds: null,
    endDate: '2027-01-01T04:59:00Z',
    volumeNum: 250000,
    liquidityNum: liquidity,
    active: true,
    closed: false,
    acceptingOrders: true,
    version: 'v1'
});

test('combines the latest completed BTC candle with the most liquid price-target market', async () => {
    process.env.REALMARKET_API_KEY = 'test-key';
    globalThis.fetch = async input => {
        const url = new URL(input);
        if (url.hostname === 'api.realmarketapi.com') {
            return jsonResponse({
                closePrice: '95000',
                openTime: '2026-11-19T20:00:00Z'
            });
        }
        if (url.hostname === 'gamma-api.polymarket.com' && url.pathname === '/markets') {
            return jsonResponse([]);
        }
        if (url.hostname === 'gamma-api.polymarket.com' && url.pathname === '/public-search') {
            return jsonResponse({
                events: [{
                    title: 'Bitcoin price targets',
                    markets: [
                        predictionMarket('target-100k', 100000, 5000),
                        predictionMarket('target-120k', 120000, 10000)
                    ]
                }]
            });
        }
        if (url.hostname === 'clob.polymarket.com') {
            return jsonResponse({
                price: url.searchParams.get('token_id').startsWith('yes-') ? '0.68' : '0.32'
            });
        }
        throw new Error(`Unexpected request: ${url.hostname}${url.pathname}`);
    };

    const result = await getBitcoinMarketComparison('H1');

    assert.equal(result.asset.latestCompletedCandle.closePrice, 95000);
    assert.equal(result.asset.latestCompletedCandle.openTime, '2026-11-19T20:00:00Z');
    assert.equal(result.prediction.marketId, 'target-120k');
    assert.equal(result.prediction.target.value, 120000);
    assert.equal(result.prediction.probability.percent, 68);
    assert.equal(result.prediction.endDate, '2027-01-01T04:59:00Z');
    assert.equal(result.comparison.targetDistanceUsd, 25000);
    assert.equal(result.comparison.targetDistancePercent, 26.32);
});

test('reports not found when no active Bitcoin price-target market exists', async () => {
    process.env.REALMARKET_API_KEY = 'test-key';
    globalThis.fetch = async input => {
        const url = new URL(input);
        if (url.hostname === 'api.realmarketapi.com') {
            return jsonResponse({ closePrice: 95000, openTime: '2026-11-19T20:00:00Z' });
        }
        if (url.pathname === '/markets') {
            return jsonResponse([]);
        }
        if (url.pathname === '/public-search') {
            return jsonResponse({ events: [] });
        }
        throw new Error(`Unexpected request: ${url.hostname}${url.pathname}`);
    };

    await assert.rejects(
        getBitcoinMarketComparison('H1'),
        error => error instanceof MarketComparisonError &&
            error.statusCode === 404 &&
            error.code === 'PREDICTION_MARKET_NOT_FOUND'
    );
});
