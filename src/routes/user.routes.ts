import express from "express";
import { verifyToken } from "../middleware/auth.middleware";
import { getUsers, getEngineers } from "../controllers/user.controller";
import { asyncHandler } from "../middleware/error.middleware";

const router = express.Router();

router.use(verifyToken); // All users routes protected

router.get('/', asyncHandler(getUsers));
router.get('/engineers', asyncHandler(getEngineers));

export default router;
