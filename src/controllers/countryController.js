import { getCountry } from '../services/statisticsService.js';

export const countryController = async (req, res) => {
    try {
        const country = await getCountry(req.params.code ?? 'BRA');
        return res.status(200).json(country);
    } catch (error) {
        console.error(error.message);
        return res.status(502).json({ mensagem: "Erro ao consultar a API externa", erro: error.message });
    }
};