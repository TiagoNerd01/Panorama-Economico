import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import testRoutes from './routes/testRoutes.js';
import countryRoutes from './routes/countryRoutes.js';

dotenv.config();
const app = express();
const configuredPort = process.env.PORT && process.env.PORT.trim();
const PORT = configuredPort ? Number(configuredPort) : 3000;
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
    throw new RangeError('A variável PORT deve ser um inteiro entre 0 e 65535.');
}

app.use(express.json());
app.use(cors());
app.use('/api', testRoutes);
app.use('/api/statistics', countryRoutes);
app.get('/', (req, res) => {
    res.send('Servidor rodando com sucesso');
});
app.get('/api/health', (req, res) => {
    res.status(200).json({ "status": "online", "message": "API panorama econômico funcionando!"});
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

