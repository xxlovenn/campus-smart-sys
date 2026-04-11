CREATE TABLE "GradeMajorChangeRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fromGrade" TEXT,
  "fromMajor" TEXT,
  "toGrade" TEXT,
  "toMajor" TEXT,
  "status" "ProfileItemRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "reviewerId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GradeMajorChangeRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GradeMajorChangeRequest"
ADD CONSTRAINT "GradeMajorChangeRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GradeMajorChangeRequest"
ADD CONSTRAINT "GradeMajorChangeRequest_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "GradeMajorChangeRequest_userId_status_idx"
ON "GradeMajorChangeRequest"("userId", "status");

