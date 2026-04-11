-- AlterTable
ALTER TABLE "Profile"
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateIndex
CREATE INDEX "Profile_reviewStatus_submittedAt_idx" ON "Profile"("reviewStatus", "submittedAt");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
