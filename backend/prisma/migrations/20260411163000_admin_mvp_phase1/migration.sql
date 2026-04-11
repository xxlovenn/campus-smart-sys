-- AlterTable
ALTER TABLE "Organization"
ADD COLUMN "descriptionZh" TEXT NOT NULL DEFAULT '',
ADD COLUMN "descriptionEn" TEXT NOT NULL DEFAULT '',
ADD COLUMN "descriptionRu" TEXT NOT NULL DEFAULT '',
ADD COLUMN "leaderUserId" TEXT;

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "idCard" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_idCard_key" ON "User"("idCard");

-- AddForeignKey
ALTER TABLE "Organization"
ADD CONSTRAINT "Organization_leaderUserId_fkey"
FOREIGN KEY ("leaderUserId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
