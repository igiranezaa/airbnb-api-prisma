import express from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.middleware";
import {
  adminGetAllUsers,
  adminUpdateUser,
  adminSuspendUser,
  adminBanUser,
  adminDeleteUser,
  adminGetAllListings,
  adminApproveListing,
  adminRejectListing,
  adminIssueRefund,
  adminIssueCoupon,
  adminGetCoupons,
  getDisputes,
  createDispute,
  updateDisputeStatus,
  addEvidence,
  getAuditLogs,
  getAdminDashboardStats,
} from "../../controllers/admin.controller";

const router = express.Router();

router.use(authenticate, requireAdmin);

// FR-073: dashboard stats
router.get("/stats", getAdminDashboardStats);

// FR-072: audit logs
router.get("/audit-logs", getAuditLogs);

// FR-069: user management
router.get("/users", adminGetAllUsers);
router.patch("/users/:id", adminUpdateUser);
router.patch("/users/:id/suspend", adminSuspendUser);
router.patch("/users/:id/ban", adminBanUser);
router.delete("/users/:id", adminDeleteUser);

// listing approval
router.get("/listings", adminGetAllListings);
router.patch("/listings/:id/approve", adminApproveListing);
router.patch("/listings/:id/reject", adminRejectListing);

// FR-070: refunds & coupons
router.post("/refunds", adminIssueRefund);
router.get("/coupons", adminGetCoupons);
router.post("/coupons", adminIssueCoupon);

// FR-071: disputes
router.get("/disputes", getDisputes);
router.post("/disputes", authenticate, createDispute); // guests/hosts can also raise
router.patch("/disputes/:id/status", updateDisputeStatus);
router.post("/disputes/:id/evidence", addEvidence);

export default router;
