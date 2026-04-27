import { Router } from "express";
import upload from "../config/multer";
import { authenticate } from "../middlewares/auth.middleware";
import { uploadAvatar } from "../controllers/upload.controller";

const router = Router();

router.post(
  "/:id/avatar",
  authenticate,
  upload.single("image"),
  uploadAvatar
);

export default router;