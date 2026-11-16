import {
    getCountry,
    getIndicators,
    searchIndicators,
    getIndicatorHistory
} from '../services/statisticsService.js';
import { getNormalizedIndicator } from '../services/statisticsService.js'
//puxa todos os dados de um pais
export const countryController = async (req, res) => {
    try {
        const country = await getCountry(req.params.code ?? req.params.id ?? 'BRA');
        return res.status(200).json(country);
    } catch (error) {
        console.error(error.message);
        return res.status(502).json({ mensagem: "Erro ao consultar a API externa", erro: error.message });
    }
};
//pesquisa indicadores
export const searchIndicatorsController = async (req, res) => {
    try {
        const {q} = req.query;
        if (!q) {
            return res.status(400).json({ mensagem: 'informe um termo para pesquisar'});
    }
    const result = await searchIndicators(q);
    return res.status(200).json(result);
}   catch (error) {
        console.error(error.message);
        return res.status(502).json({ mensagem: 'Erro ao pesquisar indicadores', erro: error.message });
    }
};
// consulta o historico de um indicador por pais
export const indicatorHistoryController = async (req, res) => {
    try {
        const { indicator, country } = req.params;
        const result = await getIndicatorHistory(indicator, country);
        return res.status(200).json(result);

    } catch (error) {
        console.error(error.message);
        return res.status(502).json({ mensagem: 'Erro ao consultar o histórico', erro: error.message });
    }
};
export const indicatorsController = async (req, res) => {
    try {
        const result = await getIndicators();

        return res.status(200).json(result);

    } catch (error) {
        console.error(error.message);

        return res.status(502).json({
            mensagem: 'Erro ao listar indicadores.',
            erro: error.message
        });
    }
};
export const normalizedIndicatorController = async (req, res) => {
    try {
        const { indicator, country } = req.params;

        const result = await getNormalizedIndicator(
            indicator,
            country
        );

        return res.status(200).json(result);

    } catch (error) {
        console.error(error.message);

        return res.status(error.statusCode || 502).json({
            error: error.code || 'INTERNAL_ERROR',
            mensagem: error.message,
            indicator: req.params.indicator,
            country: req.params.country
        });
    }
};