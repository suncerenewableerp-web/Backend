import express from "express";
import { verifyToken, authorize } from "../middleware/auth.middleware";
import { getJobCards, createJobCard, addPart } from "../controllers/jobcard.controller";
import { asyncHandler } from "../middleware/error.middleware";

const router = express.Router();

router.use(verifyToken);
router.use(authorize('jobcard', 'view'));

router.get('/', asyncHandler(getJobCards));
router.post('/', authorize('jobcard', 'create'), asyncHandler(createJobCard));
router.post('/:id/parts', authorize('jobcard', 'edit'), asyncHandler(addPart));

export default router;
