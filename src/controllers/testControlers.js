import {getTestData} from '../services/testService.js';

export const testController = (req, res) => {
    const resultado = getTestData();
    return res.status(200).json(resultado);
};
