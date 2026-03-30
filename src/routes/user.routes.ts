import express from "express";
import { authorize, verifyToken } from "../middleware/auth.middleware";
import { createUser, getUsers, getEngineers, resetUserPassword, setUserPassword } from "../controllers/user.controller";
import { asyncHandler } from "../middleware/error.middleware";

const router = express.Router();

router.use(verifyToken); // All users routes protected

router.get('/', authorize("users", "view"), asyncHandler(getUsers));
router.post('/', authorize("users", "create"), asyncHandler(createUser));
router.put('/:id/password', authorize("users", "edit"), asyncHandler(setUserPassword));
router.post('/:id/password/reset', authorize("users", "edit"), asyncHandler(resetUserPassword));

router.get('/engineers', authorize("users", "view"), asyncHandler(getEngineers));

export default router;
