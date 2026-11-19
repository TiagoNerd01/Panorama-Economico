import { getNormalizedIndicator } from './statisticsService.js';
import { getLatestRealMarketPrice } from './realMarketService.js';
import { getRelevantPredictionMarkets } from './polyMarketService.js';

const ECONOMIC_INDICATORS = {
    gdp: 'IMF.NGDPD',
    inflation: 'IMF.PCPIPCH'
};

const ASSET_PREDICTION_TOPICS = {
    XAUUSD: 'gold',
    BTCUSD: 'bitcoin'
};

const getFailure = error => ({
    status: 'unavailable',
    error: {
        code: error?.code ?? 'DASHBOARD_DATA_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'Não foi possível consultar os dados.'
    }
});

export const getDashboard = async ({
    country = 'BRA',
    assets = ['XAUUSD', 'BTCUSD'],
    timeFrame = 'H1'
} = {}) => {
    const tasks = [
        ...Object.entries(ECONOMIC_INDICATORS).map(([key, indicator]) => ({
            category: 'economy',
            key,
            run: () => getNormalizedIndicator(indicator, country)
        })),
        ...assets.flatMap(symbolCode => [
            {
                category: 'market',
                symbolCode,
                run: () => getLatestRealMarketPrice(symbolCode, timeFrame)
            },
            {
                category: 'prediction',
                symbolCode,
                run: () => getRelevantPredictionMarkets(
                    ASSET_PREDICTION_TOPICS[symbolCode]
                )
            }
        ])
    ];

    const results = await Promise.allSettled(
        tasks.map(task => Promise.resolve().then(task.run))
    );
    const dashboard = {
        economy: {},
        markets: [],
        predictions: [],
        metadata: {
            generatedAt: new Date().toISOString(),
            status: 'complete',
            successfulQueries: 0,
            failedQueries: 0
        }
    };

    results.forEach((result, index) => {
        const task = tasks[index];
        if (result.status === 'fulfilled') {
            dashboard.metadata.successfulQueries += 1;
            if (task.category === 'economy') {
                dashboard.economy[task.key] = {
                    status: 'available',
                    data: result.value
                };
            } else if (task.category === 'market') {
                dashboard.markets.push({
                    symbolCode: task.symbolCode,
                    status: 'available',
                    data: result.value
                });
            } else {
                dashboard.predictions.push({
                    symbolCode: task.symbolCode,
                    status: 'available',
                    markets: result.value
                });
            }
            return;
        }

        dashboard.metadata.failedQueries += 1;
        const failure = getFailure(result.reason);
        if (task.category === 'economy') {
            dashboard.economy[task.key] = failure;
        } else if (task.category === 'market') {
            dashboard.markets.push({
                symbolCode: task.symbolCode,
                ...failure
            });
        } else {
            dashboard.predictions.push({
                symbolCode: task.symbolCode,
                ...failure
            });
        }
    });

    if (dashboard.metadata.failedQueries > 0) {
        dashboard.metadata.status = dashboard.metadata.successfulQueries > 0
            ? 'partial'
            : 'unavailable';
    }

    return dashboard;
};
