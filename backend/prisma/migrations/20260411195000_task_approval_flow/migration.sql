-- Create enums for task approval workflow and source tracking
CREATE TYPE "TaskApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');
CREATE TYPE "TaskSource" AS ENUM ('ORG_REQUEST', 'LEAGUE_PUBLISHED');

-- Extend task table with approval-related fields
ALTER TABLE "Task"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "approvalStatus" "TaskApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "source" "TaskSource" NOT NULL DEFAULT 'LEAGUE_PUBLISHED',
ADD COLUMN "reviewNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT;

-- Reviewer relation for league admin approvals
ALTER TABLE "Task"
ADD CONSTRAINT "Task_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
