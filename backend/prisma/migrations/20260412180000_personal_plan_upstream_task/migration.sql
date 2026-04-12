-- AlterTable
ALTER TABLE "PersonalPlan" ADD COLUMN "upstreamTaskId" TEXT;

-- CreateIndex
CREATE INDEX "PersonalPlan_upstreamTaskId_idx" ON "PersonalPlan"("upstreamTaskId");

-- AddForeignKey
ALTER TABLE "PersonalPlan" ADD CONSTRAINT "PersonalPlan_upstreamTaskId_fkey" FOREIGN KEY ("upstreamTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "PersonalPlan_userId_upstreamTaskId_key" ON "PersonalPlan"("userId", "upstreamTaskId");
