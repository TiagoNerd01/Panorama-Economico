import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { getRelevantPredictionMarkets } from '../src/services/polyMarketService.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

const market = (id, question, overrides = {}) => ({
    id,
    conditionId: `condition-${id}`,
    slug: id,
    question,
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.7","0.3"]',
    clobTokenIds: '["yes-token","no-token"]',
    positionIds: null,
    endDate: '2027-01-01T00:00:00Z',
    active: true,
    closed: false,
    archived: false,
    ...overrides
});

const jsonResponse = body => ({
    ok: true,
    status: 200,
    json: async () => body
});

test('aggregates open topical markets beyond the first page and normalizes outcomes', async () => {
    const calls = [];
    const bitcoin = market('bitcoin-1', 'Will Bitcoin reach $100,000?');
    globalThis.fetch = async input => {
        const url = new URL(input);
        calls.push(url);

        if (url.pathname === '/markets') {
            return jsonResponse([
                market('gold-card', 'Will Trump sell more Gold Cards?', {}),
                market('closed-bitcoin', 'Will Bitcoin reach $90,000?', { closed: true })
            ]);
        }

        const query = url.searchParams.get('q');
        const eventsByQuery = {
            bitcoin: [{ title: 'Bitcoin price', slug: 'bitcoin-price', markets: [bitcoin] }],
            'gold price': [{
                title: 'Gold price',
                markets: [market('gold-1', 'Will Gold (XAUUSD) hit $5,000?')]
            }],
            inflation: [{
                title: 'Inflation',
                markets: [market('inflation-1', 'Will inflation exceed 4%?', {
                    description: 'The result may affect expected interest rate decisions.'
                })]
            }],
            'Fed rate': [{
                title: 'Fed rates',
                markets: [market('rates-1', 'Will the Fed cut rates?')]
            }]
        };
        return jsonResponse({ events: eventsByQuery[query] ?? [] });
    };

    const results = await getRelevantPredictionMarkets();

    assert.deepEqual(
        results.map(result => result.id).sort(),
        ['bitcoin-1', 'gold-1', 'inflation-1', 'rates-1']
    );
    assert.deepEqual(results.find(result => result.id === 'bitcoin-1').outcomes, ['Yes', 'No']);
    assert.deepEqual(results.find(result => result.id === 'bitcoin-1').clobTokenIds, ['yes-token', 'no-token']);
    assert.deepEqual(results.find(result => result.id === 'inflation-1').topics, ['inflation']);
    assert.equal(calls.filter(url => url.pathname === '/public-search').length, 4);
    assert.equal(calls.find(url => url.pathname === '/markets').searchParams.get('limit'), '50');
});

test('maps Portuguese gold search terms and filters unrelated results', async () => {
    const calls = [];
    globalThis.fetch = async input => {
        const url = new URL(input);
        calls.push(url);

        if (url.pathname === '/markets') {
            return jsonResponse([
                market('bitcoin-1', 'Will Bitcoin reach $100,000?'),
                market('gold-card', 'Will Trump sell more Gold Cards?')
            ]);
        }

        return jsonResponse({
            events: [{
                title: 'Gold price',
                markets: [
                    market('gold-1', 'Will Gold (XAUUSD) hit $5,000?'),
                    market('gold-card-search', 'Will more Gold Cards be sold?')
                ]
            }]
        });
    };

    const results = await getRelevantPredictionMarkets('ouro');

    assert.deepEqual(results.map(result => result.id), ['gold-1']);
    assert.equal(
        calls.find(url => url.pathname === '/public-search').searchParams.get('q'),
        'gold price'
    );
});
