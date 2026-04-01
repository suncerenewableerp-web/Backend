import express from "express";
import { verifyToken, authorize } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import {
  addInverterBrand,
  getSlaSettings,
  listInverterBrands,
  updateSlaSettings,
} from "../controllers/settings.controller";

const router = express.Router();

router.use(verifyToken);

router.get('/sla', authorize('sla', 'view'), asyncHandler(getSlaSettings));
router.put('/sla', authorize('sla', 'edit'), asyncHandler(updateSlaSettings));

router.get('/inverter-brands', authorize('tickets', 'view'), asyncHandler(listInverterBrands));
router.post('/inverter-brands', authorize('tickets', 'edit'), asyncHandler(addInverterBrand));

export default router;
