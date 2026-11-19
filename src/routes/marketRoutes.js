import express from 'express';
import {
    marketCandleController,
    marketComparisonController,
    marketHistoryController,
    marketPriceController
} from '../controllers/marketController.js';

const router = express.Router();

router.get('/:symbol/price', marketPriceController);
router.get('/:symbol/history', marketHistoryController);
router.get('/:symbol/candle', marketCandleController);
router.get('/:symbol/comparison', marketComparisonController);

export default router;