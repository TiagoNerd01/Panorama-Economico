import express from 'express';
import { testController } from '../controllers/testControlers.js';

const router = express.Router();
router.get('/test', testController);
export default router;
