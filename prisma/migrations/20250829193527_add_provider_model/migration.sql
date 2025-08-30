-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "speciality" TEXT NOT NULL,
    "description" TEXT,
    "experience" TEXT,
    "appointmentFee" DECIMAL NOT NULL,
    CONSTRAINT "Provider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProviderSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "isBooked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ProviderSlot_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProviderSlot" ("endTime", "id", "isBooked", "providerId", "startTime") SELECT "endTime", "id", "isBooked", "providerId", "startTime" FROM "ProviderSlot";
DROP TABLE "ProviderSlot";
ALTER TABLE "new_ProviderSlot" RENAME TO "ProviderSlot";
CREATE INDEX "ProviderSlot_providerId_startTime_idx" ON "ProviderSlot"("providerId", "startTime");
CREATE UNIQUE INDEX "ProviderSlot_providerId_startTime_key" ON "ProviderSlot"("providerId", "startTime");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Provider_userId_key" ON "Provider"("userId");
