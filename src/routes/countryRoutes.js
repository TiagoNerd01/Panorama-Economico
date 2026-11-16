import express from 'express';
import { countryController } from '../controllers/countryController.js';

const router = express.Router();

router.get('/country/:code', countryController);
router.get('/country', countryController);

export default router;
