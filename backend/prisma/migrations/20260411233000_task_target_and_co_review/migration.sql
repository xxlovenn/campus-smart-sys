-- Add audience and co-review enums
CREATE TYPE "TaskTargetType" AS ENUM ('ORGS', 'ALL_STUDENTS', 'GRADE', 'MAJOR', 'CLASS');
CREATE TYPE "OrgReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Extend user dimension fields
ALTER TABLE "User"
ADD COLUMN "grade" TEXT,
ADD COLUMN "major" TEXT,
ADD COLUMN "className" TEXT;

-- Extend task target fields
ALTER TABLE "Task"
ADD COLUMN "targetType" "TaskTargetType" NOT NULL DEFAULT 'ORGS',
ADD COLUMN "targetGrade" TEXT,
ADD COLUMN "targetMajor" TEXT,
ADD COLUMN "targetClass" TEXT;

-- Co-review table for related organizations
CREATE TABLE "TaskOrgReview" (
  "taskId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "status" "OrgReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewerId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reason" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "TaskOrgReview_pkey" PRIMARY KEY ("taskId","organizationId")
);

ALTER TABLE "TaskOrgReview"
ADD CONSTRAINT "TaskOrgReview_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskOrgReview"
ADD CONSTRAINT "TaskOrgReview_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskOrgReview"
ADD CONSTRAINT "TaskOrgReview_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
