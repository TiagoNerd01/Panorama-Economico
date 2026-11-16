//url para paises
const URL = 'https://statisticsoftheworld.com/api/v1/countries';
//indicadores que sao utilizados no projeto
const INDICATORS = {
    'IMF.NGDPD': {
        name: 'GDP (nominal)',
        unit: 'USD',
        source: 'International Monetary Fund (IMF)'
    },
    'IMF.PCPIPCH': {
        name: 'Inflation',
        unit: '%',
        source: 'International Monetary Fund (IMF)'
    }
};
//conversao dos nomes dos paises para nomes padronizados
const COUNTRIES = {
    'BRA': 'Brazil',
    'USA': 'United States',
};
//pega todos os dados de um pais
export const getCountry = async (code) => {
    const response = await fetch(`${URL}/${encodeURIComponent(code)}`);
    if (!response.ok) {
        throw new Error(`Erro na API externa: ${response.status}`);
    }
    return response.json();
};
//pesquisa indicadores pelo nome ou codigo
const BASE_URL = 'https://statisticsoftheworld.com/api/v1';
export const searchIndicators = async (query) => {
    const params = new URLSearchParams({
        q:  query
    });
    const response = await fetch(
        `${BASE_URL}/search?${params}`
    );
    if (!response.ok) {
        throw new Error(`Erro na API externa: ${response.status}`);
    };
    return await response.json();
};
//consulta o historico de um indicador por pais
export const getIndicatorHistory = async (indicator, country) => {
    const response = await fetch(
        `${BASE_URL}/history/${encodeURIComponent(indicator)}/${encodeURIComponent(country)}`
    );
    if (!response.ok) {
        throw new Error(`Erro ao consultar o histórico: HTTP ${response.status}`);
    }
    return await response.json();
};
export const getIndicators = async () => {
    const response = await fetch(`${BASE_URL}/indicators`);

    if (!response.ok) {
        throw new Error(
            `Erro ao listar indicadores: HTTP ${response.status}`
        );
    }

    return await response.json();
};
//Erro personalizado para controlar respostas da API
export class StatisticsApiError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
};
//funçao para consulmir a api externa (auxiliar)
const requestJson = async (path) => {
    let response;
    try {
        response = await fetch(`${BASE_URL}${path}`);
    } catch (error) {
        throw new StatisticsApiError(
            'Erro ao conectar com a API externa',
            502,
            'EXTERNAL_API_CONNECTION_ERROR'
        );
    }
    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        if (response.ok) {
            throw new StatisticsApiError(
                'A API externa retornou uma resposta inválida',
                502,
                'INVALID_EXTERNAL_API_RESPONSE'
            );
        }
        if (!response.ok) {
            const statusCode = response.status === 404
            ? 404
            : response.status === 400
            ? 400
            : response.status === 429
                ? 503
                : 502;
            throw new StatisticsApiError(
                `Erro na API externa: HTTP ${response.status}`,
                statusCode,
                'EXTERNAL_API_ERROR'
            );
        }
    if (!data || typeof data !== 'object') {
        throw new StatisticsApiError(
            'A resposta externa não possui um formato valido',
            502,
            'INVALID_EXTERNAL_API_RESPONSE'
        );
    }
    return data;
    };
};
//consulta historica
export const getIndicatorHistoryWithValidation = async (indicator, country) => {
    const path = `/history/${encodeURIComponent(indicator)}/${encodeURIComponent(country)}`;
    const data = await requestJson(path);
};
export const getNormalizedIndicator = async (
    indicatorId,
    countryCode
) => {

    // Verifica se o indicador faz parte do projeto
    const definition = INDICATORS[indicatorId];

    if (!definition) {
        throw new StatisticsApiError(
            'Indicador não disponível no projeto.',
            404,
            'INDICATOR_NOT_SUPPORTED'
        );
    }

    const country = countryCode.toUpperCase();

    // Valida o formato do código do país
    if (!/^[A-Z]{3}$/.test(country)) {
        throw new StatisticsApiError(
            'Código de país inválido.',
            400,
            'INVALID_COUNTRY_CODE'
        );
    }

    // Busca o histórico na API externa
    const history = await getIndicatorHistory(
        indicatorId,
        country
    );

    if (!Array.isArray(history.data)) {
        throw new StatisticsApiError(
            'Formato de histórico inválido.',
            502,
            'INVALID_HISTORY_FORMAT'
        );
    }

    const currentYear = new Date().getUTCFullYear();

    const source = String(
        history.indicator?.source ?? definition.source
    ).toLowerCase();

    // Separa os dados históricos das projeções
    const historicalData = history.data
        .filter(item => {
            const year = Number(item.year);

            if (!Number.isInteger(year)) {
                return false;
            }

            // O FMI considera o ano corrente e os posteriores
            // como projeções na série WEO.
            if (source === 'imf' && year >= currentYear) {
                return false;
            }

            return true;
        })
        .sort((a, b) => Number(b.year) - Number(a.year));

    if (historicalData.length === 0) {
        throw new StatisticsApiError(
            'Não existem dados históricos disponíveis para este indicador e país.',
            404,
            'INDICATOR_UNAVAILABLE'
        );
    }

    // Seleciona o registro histórico mais recente
    const latest = historicalData[0];

    // Trata valores nulos e inválidos
    const validValue =
        latest.value !== null &&
        latest.value !== undefined &&
        latest.value !== '' &&
        Number.isFinite(Number(latest.value));

    const normalizedValue = validValue
        ? Number(latest.value)
        : null;

    // Retorna o formato padronizado
    return {
        indicator: definition.name,
        country: COUNTRIES[country] ?? country,
        value: normalizedValue,
        unit: definition.unit,
        referenceYear: Number(latest.year),
        source: String(
            history.indicator?.source ?? definition.source
        ).toUpperCase(),
        retrievedAt: new Date().toISOString(),
        availability: validValue ? 'available' : 'unavailable',
        observationType: 'historical'
    };
};

