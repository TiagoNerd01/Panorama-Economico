// Importa o Express para criar o servidor HTTP e as rotas da aplicação.
import express from 'express';
// Importa o middleware CORS para permitir integração com outras origens.
import cors from 'cors';
// Importa o carregador de variáveis de ambiente do arquivo .env.
import dotenv from 'dotenv';
// Importa as rotas de teste e saúde existentes.
import testRoutes from './routes/testRoutes.js';
// Importa as rotas de estatísticas econômicas.
import countryRoutes from './routes/countryRoutes.js';
// Importa as rotas de cotações e candles dos ativos.
import marketRoutes from './routes/marketRoutes.js';
// Importa as rotas de mercados e previsões do Polymarket.
import predictionRoutes from './routes/predictionRoutes.js';
// Importa a rota que reúne dados para o dashboard.
import dashboardRoutes from './routes/dashboardRoutes.js';
// Importa utilitários para resolver caminhos absolutos da interface estática.
import path from 'node:path';
// Importa utilitários para localizar o diretório deste módulo ES.
import { fileURLToPath } from 'node:url';

// Carrega no processo as configurações definidas em .env.
dotenv.config();
// Cria a aplicação Express que receberá as requisições HTTP.
const app = express();
// Lê a porta configurada e remove espaços em branco externos.
const configuredPort = process.env.PORT && process.env.PORT.trim();
// Usa a porta configurada ou a porta padrão 3000.
const PORT = configuredPort ? Number(configuredPort) : 3000;
// Interrompe a inicialização quando a porta não é um inteiro válido.
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
    // Informa qual faixa de portas é aceita pela aplicação.
    throw new RangeError('A variável PORT deve ser um inteiro entre 0 e 65535.');
}

// Obtém o caminho absoluto deste arquivo server.js.
const currentFile = fileURLToPath(import.meta.url);
// Obtém a pasta src a partir do caminho do arquivo atual.
const currentDirectory = path.dirname(currentFile);
// Resolve a pasta public, que contém a interface HTML, CSS e JavaScript.
const publicDirectory = path.join(currentDirectory, '..', 'public');

// Habilita a leitura de corpos JSON nas requisições recebidas.
app.use(express.json());
// Habilita requisições cross-origin para integrações externas ao frontend.
app.use(cors());
// Publica a interface web e serve index.html para a página inicial.
app.use(express.static(publicDirectory));
// Monta as rotas de teste e saúde sob o prefixo /api.
app.use('/api', testRoutes);
// Monta as rotas de países e indicadores sob /api/statistics.
app.use('/api/statistics', countryRoutes);
// Monta as consultas RealMarketAPI sob /api/markets.
app.use('/api/markets', marketRoutes);
// Monta as consultas Gamma e CLOB sob /api/predictions.
app.use('/api/predictions', predictionRoutes);
// Monta o serviço agregador sob /api/dashboard.
app.use('/api/dashboard', dashboardRoutes);
// Expõe uma verificação simples de disponibilidade do backend.
app.get('/api/health', (req, res) => {
    // Retorna um JSON curto para monitoramento e testes de conectividade.
    res.status(200).json({ "status": "online", "message": "API panorama econômico funcionando!"});
});

// Inicia o servidor HTTP e informa a URL local de acesso.
app.listen(PORT, () => {
    // Registra no terminal o endereço em que a API está disponível.
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

