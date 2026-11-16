import express from 'express';
import {
    countryController,
    searchIndicatorsController,
    indicatorHistoryController,
    indicatorsController
} from '../controllers/countryController.js';
import { normalizedIndicatorController } from '../controllers/countryController.js';
const router = express.Router();

router.get('/country/:code', countryController);
router.get('/country', countryController);
router.get('/countries/:id', countryController);
router.get('/indicators/search', searchIndicatorsController);
router.get('/history/indicator/:indicator/:country', indicatorHistoryController);
router.get('/indicators', indicatorsController);
router.get('/normalized/:indicator/:country',normalizedIndicatorController);
export default router;

