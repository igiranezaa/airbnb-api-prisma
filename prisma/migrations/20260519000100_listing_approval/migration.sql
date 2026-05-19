CREATE TYPE "ListingApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Listing"
ADD COLUMN "approvalStatus" "ListingApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "rejectionReason" TEXT;

UPDATE "Listing"
SET "approvalStatus" = CASE
  WHEN "published" = true THEN 'APPROVED'::"ListingApprovalStatus"
  ELSE 'PENDING'::"ListingApprovalStatus"
END;

ALTER TABLE "Listing"
ALTER COLUMN "approvalStatus" SET DEFAULT 'PENDING';

CREATE INDEX "Listing_approvalStatus_idx" ON "Listing"("approvalStatus");
