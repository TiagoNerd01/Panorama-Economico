import { getDashboard } from '../services/dashboardService.js';

const SUPPORTED_ASSETS = new Set(['XAUUSD', 'BTCUSD']);
const VALID_TIMEFRAMES = new Set(['M1', 'M5', 'M15', 'H1', 'H4', 'D1']);

export const dashboardController = async (req, res) => {
    const country = req.query.country === undefined
        ? 'BRA'
        : req.query.country;
    if (typeof country !== 'string' || !/^[A-Za-z]{3}$/.test(country.trim())) {
        return res.status(400).json({
            error: 'INVALID_COUNTRY_CODE',
            message: 'country deve ser um código ISO de três letras, como BRA.'
        });
    }

    const assetsQuery = req.query.assets === undefined
        ? 'XAUUSD,BTCUSD'
        : req.query.assets;
    if (typeof assetsQuery !== 'string' || assetsQuery.trim().length === 0) {
        return res.status(400).json({
            error: 'INVALID_ASSETS',
            message: 'assets deve ser uma lista separada por vírgulas.'
        });
    }

    const assets = assetsQuery.split(',').map(asset => asset.trim().toUpperCase());
    if (
        assets.some(asset => !SUPPORTED_ASSETS.has(asset)) ||
        new Set(assets).size !== assets.length
    ) {
        return res.status(400).json({
            error: 'INVALID_ASSETS',
            message: 'Os ativos aceitos são XAUUSD e BTCUSD, sem duplicatas.'
        });
    }

    const timeFrame = req.query.timeFrame === undefined
        ? 'H1'
        : req.query.timeFrame;
    if (
        typeof timeFrame !== 'string' ||
        !VALID_TIMEFRAMES.has(timeFrame.trim().toUpperCase())
    ) {
        return res.status(400).json({
            error: 'INVALID_TIMEFRAME',
            message: 'timeFrame deve ser M1, M5, M15, H1, H4 ou D1.'
        });
    }

    try {
        const dashboard = await getDashboard({
            country: country.trim().toUpperCase(),
            assets,
            timeFrame: timeFrame.trim().toUpperCase()
        });
        return res.status(200).json(dashboard);
    } catch (error) {
        console.error(error.message);
        return res.status(500).json({
            error: 'DASHBOARD_ERROR',
            message: 'Não foi possível gerar o dashboard.'
        });
    }
};
