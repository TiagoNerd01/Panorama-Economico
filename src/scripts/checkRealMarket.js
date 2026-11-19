import { testRealMarketConnection } from '../services/realMarketService.js';

const suggestedSymbols = ['XAUUSD', 'BTCUSD', 'ETHUSD'];

try {
    const { symbols, account } = await testRealMarketConnection();
    const accountDetails = { ...account };
    delete accountDetails.email;
    delete accountDetails.apiKey;

    const symbolByCode = new Map(
        symbols.map(symbol => [symbol.symbolCode, symbol])
    );
    const planSymbols = Array.isArray(account.symbols)
        ? new Set(account.symbols)
        : null;

    console.log(JSON.stringify({
        connection: 'ok',
        account: accountDetails,
        symbols: symbols.map(({ symbolCode, displayName, marketClass }) => ({
            symbolCode,
            displayName,
            marketClass
        })),
        suggestedSymbols: suggestedSymbols.map(symbolCode => ({
            symbolCode,
            inCatalog: symbolByCode.has(symbolCode),
            availableInPlan: planSymbols?.has(symbolCode) ?? null,
            catalogEntry: symbolByCode.get(symbolCode) ?? null
        }))
    }, null, 2));
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
