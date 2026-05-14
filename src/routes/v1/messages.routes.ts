import express from "express";
import { getMessages, sendMessage } from "../../controllers/messages.controller";
import { authenticate } from "../../middlewares/auth.middleware";

const router = express.Router();

router.get("/", authenticate, getMessages);
router.post("/", authenticate, sendMessage);

export default router;
