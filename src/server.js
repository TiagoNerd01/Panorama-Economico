import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import testRoutes from './routes/testRoutes.js';
import countryRoutes from './routes/countryRoutes.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(cors());
app.use('/api', testRoutes);
app.use('/api/statistics', countryRoutes);
app.get('/', (req, res) => {
    res.send('Servidor rodando com sucesso');
});
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
app.get('/api/health', (req, res) => {
    res.status(200).json({ "status": "online", "message": "API panorama econômico funcionando!"});
});

