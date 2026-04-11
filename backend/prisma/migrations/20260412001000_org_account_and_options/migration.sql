-- Organization account/password fields
ALTER TABLE "Organization"
ADD COLUMN "adminUserId" TEXT,
ADD COLUMN "adminAccount" TEXT,
ADD COLUMN "adminPassword" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX "Organization_adminAccount_key" ON "Organization"("adminAccount");

ALTER TABLE "Organization"
ADD CONSTRAINT "Organization_adminUserId_fkey"
FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Meta options for league admin management
CREATE TABLE "GradeOption" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradeOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GradeOption_name_key" ON "GradeOption"("name");

CREATE TABLE "MajorOption" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MajorOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MajorOption_name_key" ON "MajorOption"("name");
