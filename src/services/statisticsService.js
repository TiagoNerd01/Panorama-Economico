const URL = 'https://statisticsoftheworld.com/api/v1/countries';

export const getCountry = async (code) => {
    const response = await fetch(`${URL}/${encodeURIComponent(code)}`);
    if (!response.ok) {
        throw new Error(`Erro na API externa: ${response.status}`);
    }
    return response.json();
};