-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "ActivityLogType" AS ENUM ('ORGANIZATION', 'TASK');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('TODO', 'DONE');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "logoUrl" TEXT DEFAULT '',
ADD COLUMN     "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedById" TEXT;

-- AlterTable
ALTER TABLE "PersonalPlan" ADD COLUMN     "noteEn" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "noteRu" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "noteZh" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" "PlanStatus" NOT NULL DEFAULT 'TODO';

-- CreateTable
CREATE TABLE "ActivityChangeLog" (
    "id" TEXT NOT NULL,
    "logType" "ActivityLogType" NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "organizationId" TEXT,
    "taskId" TEXT,
    "actorId" TEXT,
    "detailZh" TEXT NOT NULL DEFAULT '',
    "detailEn" TEXT NOT NULL DEFAULT '',
    "detailRu" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityChangeLog_logType_entityId_createdAt_idx" ON "ActivityChangeLog"("logType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityChangeLog_organizationId_createdAt_idx" ON "ActivityChangeLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityChangeLog_taskId_createdAt_idx" ON "ActivityChangeLog"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "ActivityChangeLog" ADD CONSTRAINT "ActivityChangeLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityChangeLog" ADD CONSTRAINT "ActivityChangeLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityChangeLog" ADD CONSTRAINT "ActivityChangeLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
