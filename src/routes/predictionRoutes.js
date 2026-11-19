import express from 'express';
import {
    predictionController,
    predictionDetailsController,
    predictionHistoryController
} from '../controllers/predictionController.js';

const router = express.Router();

router.get('/', predictionController);
router.get('/:id/history', predictionHistoryController);
router.get('/:id', predictionDetailsController);

export default router;