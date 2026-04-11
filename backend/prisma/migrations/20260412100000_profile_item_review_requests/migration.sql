CREATE TYPE "ProfileItemAction" AS ENUM ('ADD', 'DELETE');

CREATE TYPE "ProfileItemRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AwardChangeRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" "ProfileItemAction" NOT NULL,
  "awardId" TEXT,
  "titleZh" TEXT NOT NULL DEFAULT '',
  "titleEn" TEXT NOT NULL DEFAULT '',
  "titleRu" TEXT NOT NULL DEFAULT '',
  "proofUrl" TEXT DEFAULT '',
  "status" "ProfileItemRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "reviewerId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AwardChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TagChangeRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" "ProfileItemAction" NOT NULL,
  "tagId" TEXT,
  "categoryZh" TEXT NOT NULL DEFAULT '',
  "categoryEn" TEXT NOT NULL DEFAULT '',
  "categoryRu" TEXT NOT NULL DEFAULT '',
  "nameZh" TEXT NOT NULL DEFAULT '',
  "nameEn" TEXT NOT NULL DEFAULT '',
  "nameRu" TEXT NOT NULL DEFAULT '',
  "status" "ProfileItemRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "reviewerId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TagChangeRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AwardChangeRequest"
ADD CONSTRAINT "AwardChangeRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AwardChangeRequest"
ADD CONSTRAINT "AwardChangeRequest_awardId_fkey"
FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AwardChangeRequest"
ADD CONSTRAINT "AwardChangeRequest_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TagChangeRequest"
ADD CONSTRAINT "TagChangeRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TagChangeRequest"
ADD CONSTRAINT "TagChangeRequest_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "SkillTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TagChangeRequest"
ADD CONSTRAINT "TagChangeRequest_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AwardChangeRequest_userId_status_idx"
ON "AwardChangeRequest"("userId", "status");

CREATE INDEX "TagChangeRequest_userId_status_idx"
ON "TagChangeRequest"("userId", "status");

