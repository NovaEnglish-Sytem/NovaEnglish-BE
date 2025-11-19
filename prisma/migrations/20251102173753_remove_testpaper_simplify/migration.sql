/*
  Warnings:

  - You are about to drop the column `isPublished` on the `QuestionPackage` table. All the data in the column will be lost.
  - You are about to drop the column `paperId` on the `QuestionPage` table. All the data in the column will be lost.
  - You are about to drop the column `testPaperId` on the `TestAttempt` table. All the data in the column will be lost.
  - You are about to drop the `TestPaper` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `packageId` to the `QuestionPage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `packageId` to the `TestAttempt` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "QuestionPage" DROP CONSTRAINT "QuestionPage_paperId_fkey";

-- DropForeignKey
ALTER TABLE "TestAttempt" DROP CONSTRAINT "TestAttempt_testPaperId_fkey";

-- DropForeignKey
ALTER TABLE "TestPaper" DROP CONSTRAINT "TestPaper_createdById_fkey";

-- DropForeignKey
ALTER TABLE "TestPaper" DROP CONSTRAINT "TestPaper_packageId_fkey";

-- DropIndex
DROP INDEX "QuestionPackage_isPublished_idx";

-- DropIndex
DROP INDEX "QuestionPage_paperId_pageOrder_idx";

-- DropIndex
DROP INDEX "TestAttempt_testPaperId_idx";

-- AlterTable
ALTER TABLE "QuestionPackage" DROP COLUMN "isPublished",
ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "PaperStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "QuestionPage" DROP COLUMN "paperId",
ADD COLUMN     "packageId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TestAttempt" DROP COLUMN "testPaperId",
ADD COLUMN     "packageId" TEXT NOT NULL;

-- DropTable
DROP TABLE "TestPaper";

-- CreateIndex
CREATE INDEX "QuestionPackage_status_idx" ON "QuestionPackage"("status");

-- CreateIndex
CREATE INDEX "QuestionPage_packageId_pageOrder_idx" ON "QuestionPage"("packageId", "pageOrder");

-- CreateIndex
CREATE INDEX "TestAttempt_packageId_idx" ON "TestAttempt"("packageId");

-- AddForeignKey
ALTER TABLE "QuestionPage" ADD CONSTRAINT "QuestionPage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "QuestionPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "QuestionPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
