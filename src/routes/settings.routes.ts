import express from "express";
import { verifyToken, authorize } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import {
  addInverterBrand,
  addJobCardEngineerName,
  deleteInverterBrand,
  deleteJobCardEngineerName,
  getSlaSettings,
  listJobCardEngineerNames,
  listInverterBrands,
  updateSlaSettings,
} from "../controllers/settings.controller";

const router = express.Router();

router.use(verifyToken);

router.get('/sla', authorize('sla', 'view'), asyncHandler(getSlaSettings));
router.put('/sla', authorize('sla', 'edit'), asyncHandler(updateSlaSettings));

router.get('/inverter-brands', authorize('tickets', 'view'), asyncHandler(listInverterBrands));
router.post('/inverter-brands', authorize('tickets', 'edit'), asyncHandler(addInverterBrand));
router.delete('/inverter-brands/:key', authorize('tickets', 'edit'), asyncHandler(deleteInverterBrand));

router.get('/jobcard-engineers', authorize('tickets', 'view'), asyncHandler(listJobCardEngineerNames));
router.post('/jobcard-engineers', authorize('tickets', 'edit'), asyncHandler(addJobCardEngineerName));
router.delete('/jobcard-engineers/:key', authorize('tickets', 'edit'), asyncHandler(deleteJobCardEngineerName));

export default router;
