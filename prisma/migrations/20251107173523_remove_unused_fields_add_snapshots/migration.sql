/*
  Warnings:

  - You are about to drop the column `bandScoreId` on the `TestAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `maxScore` on the `TestAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `percentageScore` on the `TestAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `bandScoreId` on the `TestRecord` table. All the data in the column will be lost.
  - You are about to drop the column `completedAt` on the `TestRecord` table. All the data in the column will be lost.
  - You are about to drop the column `overallBandScore` on the `TestRecord` table. All the data in the column will be lost.
  - You are about to drop the column `startedAt` on the `TestRecord` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `TestRecord` table. All the data in the column will be lost.
  - You are about to drop the `TestAttemptSection` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TestAttempt" DROP CONSTRAINT "TestAttempt_bandScoreId_fkey";

-- DropForeignKey
ALTER TABLE "TestAttempt" DROP CONSTRAINT "TestAttempt_packageId_fkey";

-- DropForeignKey
ALTER TABLE "TestAttemptSection" DROP CONSTRAINT "TestAttemptSection_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "TestRecord" DROP CONSTRAINT "TestRecord_bandScoreId_fkey";

-- DropIndex
DROP INDEX "TestAttempt_bandScoreId_idx";

-- DropIndex
DROP INDEX "TestRecord_bandScoreId_idx";

-- DropIndex
DROP INDEX "TestRecord_completedAt_idx";

-- AlterTable
ALTER TABLE "TestAttempt" DROP COLUMN "bandScoreId",
DROP COLUMN "maxScore",
DROP COLUMN "percentageScore",
ADD COLUMN     "categoryName" TEXT,
ADD COLUMN     "packageTitle" TEXT;

-- AlterTable
ALTER TABLE "TestRecord" DROP COLUMN "bandScoreId",
DROP COLUMN "completedAt",
DROP COLUMN "overallBandScore",
DROP COLUMN "startedAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "averageScore" DOUBLE PRECISION;

-- DropTable
DROP TABLE "TestAttemptSection";

-- AddForeignKey
ALTER TABLE "TestAttempt" ADD CONSTRAINT "TestAttempt_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "QuestionPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
