import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
    getMarketOutcomePriceHistory,
    getMarketOutcomePrices
} from '../src/services/clobService.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

const jsonResponse = body => ({
    ok: true,
    status: 200,
    json: async () => body
});

test('associates v1 prices with Yes/No outcomes and converts them to percent', async () => {
    const calls = [];
    globalThis.fetch = async input => {
        const url = new URL(input);
        calls.push(url);
        return jsonResponse({
            price: url.searchParams.get('token_id') === 'yes-token' ? '0.65' : '0.35'
        });
    };

    const outcomes = await getMarketOutcomePrices({
        version: 'v1',
        outcomes: ['Yes', 'No'],
        clobTokenIds: ['yes-token', 'no-token'],
        positionIds: []
    });

    assert.deepEqual(
        outcomes.map(({ label, polarity, tokenId, price, impliedProbabilityPercent }) => ({
            label,
            polarity,
            tokenId,
            price,
            impliedProbabilityPercent
        })),
        [
            {
                label: 'Yes',
                polarity: 'positive',
                tokenId: 'yes-token',
                price: 0.65,
                impliedProbabilityPercent: 65
            },
            {
                label: 'No',
                polarity: 'negative',
                tokenId: 'no-token',
                price: 0.35,
                impliedProbabilityPercent: 35
            }
        ]
    );
    assert.ok(calls.every(url => url.searchParams.get('side') === 'BUY'));
});

test('uses v2 position IDs for daily history and converts timestamps and probabilities', async () => {
    const calls = [];
    globalThis.fetch = async input => {
        const url = new URL(input);
        calls.push(url);
        return jsonResponse({
            history: [{ t: 1795046433, p: 0.4 }]
        });
    };

    const outcomes = await getMarketOutcomePriceHistory({
        version: 'v2',
        outcomes: ['Yes', 'No'],
        clobTokenIds: ['legacy-yes', 'legacy-no'],
        positionIds: ['yes-position', 'no-position']
    });

    assert.deepEqual(calls.map(url => url.searchParams.get('market')).sort(), [
        'no-position',
        'yes-position'
    ]);
    assert.ok(calls.every(url =>
        url.searchParams.get('interval') === '1d' &&
        url.searchParams.get('fidelity') === '1440'
    ));
    assert.equal(outcomes[0].tokenId, 'yes-position');
    assert.deepEqual(outcomes[0].history, [{
        timestamp: new Date(1795046433 * 1000).toISOString(),
        price: 0.4,
        impliedProbabilityPercent: 40
    }]);
});
