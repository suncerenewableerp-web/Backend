import express from "express";
import { verifyToken, authorize } from "../middleware/auth.middleware";
import { asyncHandler } from "../middleware/error.middleware";
import {
  addCustomerCompany,
  addInverterCapacity,
  addInverterBrand,
  addInverterModel,
  addJobCardEngineerName,
  addJobCardRepairActionName,
  deleteCustomerCompany,
  deleteInverterCapacity,
  deleteInverterBrand,
  deleteJobCardEngineerName,
  deleteJobCardRepairActionName,
  getSlaSettings,
  listCustomerCompanies,
  listInverterCapacities,
  listJobCardEngineerNames,
  listJobCardRepairActionNames,
  listInverterBrands,
  listInverterModels,
  updateSlaSettings,
  updateJobCardRepairActionName,
} from "../controllers/settings.controller";

const router = express.Router();

router.use(verifyToken);

router.get('/sla', authorize('sla', 'view'), asyncHandler(getSlaSettings));
router.put('/sla', authorize('sla', 'edit'), asyncHandler(updateSlaSettings));

router.get('/inverter-brands', authorize('tickets', 'view'), asyncHandler(listInverterBrands));
router.post('/inverter-brands', authorize('tickets', 'edit'), asyncHandler(addInverterBrand));
router.delete('/inverter-brands/:key', authorize('tickets', 'edit'), asyncHandler(deleteInverterBrand));

router.get('/customer-companies', authorize('tickets', 'view'), asyncHandler(listCustomerCompanies));
router.post('/customer-companies', authorize('tickets', 'edit'), asyncHandler(addCustomerCompany));
router.delete('/customer-companies/:key', authorize('tickets', 'edit'), asyncHandler(deleteCustomerCompany));

router.get('/inverter-capacities', authorize('tickets', 'view'), asyncHandler(listInverterCapacities));
router.post('/inverter-capacities', authorize('tickets', 'edit'), asyncHandler(addInverterCapacity));
router.delete('/inverter-capacities/:key', authorize('tickets', 'edit'), asyncHandler(deleteInverterCapacity));

router.get('/inverter-models', authorize('tickets', 'view'), asyncHandler(listInverterModels));
router.post('/inverter-models', authorize('tickets', 'edit'), asyncHandler(addInverterModel));

router.get('/jobcard-engineers', authorize('tickets', 'view'), asyncHandler(listJobCardEngineerNames));
router.post('/jobcard-engineers', authorize('tickets', 'edit'), asyncHandler(addJobCardEngineerName));
router.delete('/jobcard-engineers/:key', authorize('tickets', 'edit'), asyncHandler(deleteJobCardEngineerName));

router.get('/jobcard-repair-actions', authorize('tickets', 'view'), asyncHandler(listJobCardRepairActionNames));
router.post('/jobcard-repair-actions', authorize('tickets', 'edit'), asyncHandler(addJobCardRepairActionName));
router.put('/jobcard-repair-actions/:key', authorize('tickets', 'edit'), asyncHandler(updateJobCardRepairActionName));
router.delete('/jobcard-repair-actions/:key', authorize('tickets', 'edit'), asyncHandler(deleteJobCardRepairActionName));

export default router;
