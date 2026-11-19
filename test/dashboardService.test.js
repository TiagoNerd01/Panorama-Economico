import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { getDashboard } from '../src/services/dashboardService.js';

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

const jsonResponse = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
});

const predictionMarket = (id, question) => ({
    id,
    conditionId: `condition-${id}`,
    slug: id,
    question,
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.7","0.3"]',
    clobTokenIds: '["yes-token","no-token"]',
    active: true,
    closed: false
});

test('aggregates economic indicators, asset prices, and matching prediction markets', async () => {
    process.env.REALMARKET_API_KEY = 'test-key';
    globalThis.fetch = async input => {
        const url = new URL(input);
        if (url.hostname === 'statisticsoftheworld.com') {
            return jsonResponse({
                data: [{ year: 2024, value: '123.4' }],
                indicator: { source: 'IMF' }
            });
        }
        if (url.hostname === 'api.realmarketapi.com') {
            return jsonResponse({
                symbolCode: url.searchParams.get('symbolCode'),
                closePrice: 100,
                openTime: '2026-11-19T20:00:00.000Z'
            });
        }
        if (url.hostname === 'gamma-api.polymarket.com' && url.pathname === '/markets') {
            return jsonResponse([]);
        }
        if (url.hostname === 'gamma-api.polymarket.com' && url.pathname === '/public-search') {
            const query = url.searchParams.get('q');
            const market = query === 'gold price'
                ? predictionMarket('gold-1', 'Will Gold reach $5,000?')
                : predictionMarket('bitcoin-1', 'Will Bitcoin reach $100,000?');
            return jsonResponse({
                events: [{ title: 'Asset market', markets: [market] }]
            });
        }
        throw new Error(`Unexpected request: ${url.hostname}${url.pathname}`);
    };

    const result = await getDashboard({
        country: 'BRA',
        assets: ['XAUUSD', 'BTCUSD'],
        timeFrame: 'H1'
    });

    assert.equal(result.economy.gdp.status, 'available');
    assert.equal(result.economy.inflation.data.value, 123.4);
    assert.deepEqual(result.markets.map(item => item.symbolCode), ['XAUUSD', 'BTCUSD']);
    assert.equal(result.markets[0].data.closePrice, 100);
    assert.equal(result.predictions[0].markets[0].id, 'gold-1');
    assert.equal(result.predictions[1].markets[0].id, 'bitcoin-1');
    assert.equal(result.metadata.status, 'complete');
    assert.equal(result.metadata.failedQueries, 0);
    assert.ok(Number.isFinite(Date.parse(result.metadata.generatedAt)));
});

test('keeps successful categories when an individual source fails', async () => {
    process.env.REALMARKET_API_KEY = 'test-key';
    globalThis.fetch = async input => {
        const url = new URL(input);
        if (url.hostname === 'statisticsoftheworld.com') {
            return jsonResponse({
                data: [{ year: 2024, value: '123.4' }],
                indicator: { source: 'IMF' }
            });
        }
        if (url.hostname === 'api.realmarketapi.com') {
            if (url.searchParams.get('symbolCode') === 'XAUUSD') {
                throw new Error('Temporary quote failure');
            }
            return jsonResponse({ closePrice: 100, openTime: '2026-11-19T20:00:00Z' });
        }
        if (url.hostname === 'gamma-api.polymarket.com' && url.pathname === '/markets') {
            return jsonResponse([]);
        }
        if (url.hostname === 'gamma-api.polymarket.com' && url.pathname === '/public-search') {
            return jsonResponse({ events: [] });
        }
        throw new Error(`Unexpected request: ${url.hostname}${url.pathname}`);
    };

    const result = await getDashboard({
        country: 'BRA',
        assets: ['XAUUSD', 'BTCUSD']
    });

    assert.equal(result.markets[0].status, 'unavailable');
    assert.equal(result.markets[0].error.code, 'REALMARKET_CONNECTION_ERROR');
    assert.equal(result.markets[1].status, 'available');
    assert.equal(result.economy.gdp.status, 'available');
    assert.equal(result.metadata.status, 'partial');
    assert.equal(result.metadata.failedQueries, 1);
});
