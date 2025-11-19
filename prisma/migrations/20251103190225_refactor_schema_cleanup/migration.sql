/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `ActiveTestSession` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `MediaAsset` table. All the data in the column will be lost.
  - You are about to drop the column `code` on the `QuestionCategory` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `QuestionCategory` table. All the data in the column will be lost.
  - You are about to drop the column `correctKeys` on the `QuestionItem` table. All the data in the column will be lost.
  - You are about to drop the column `points` on the `QuestionItem` table. All the data in the column will be lost.
  - You are about to drop the column `promptHtml` on the `QuestionItem` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `QuestionPackage` table. All the data in the column will be lost.
  - You are about to drop the column `selectedKeys` on the `TemporaryAnswer` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `TemporaryAnswer` table. All the data in the column will be lost.
  - Added the required column `question` to the `QuestionItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_createdById_fkey";

-- DropForeignKey
ALTER TABLE "QuestionCategory" DROP CONSTRAINT "QuestionCategory_createdById_fkey";

-- DropForeignKey
ALTER TABLE "QuestionPackage" DROP CONSTRAINT "QuestionPackage_createdById_fkey";

-- DropIndex
DROP INDEX "MediaAsset_createdById_idx";

-- DropIndex
DROP INDEX "QuestionCategory_code_key";

-- DropIndex
DROP INDEX "QuestionCategory_createdById_idx";

-- DropIndex
DROP INDEX "QuestionPackage_createdById_idx";

-- DropIndex
DROP INDEX "TemporaryAnswer_updatedAt_idx";

-- AlterTable
ALTER TABLE "ActiveTestSession" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "MediaAsset" DROP COLUMN "createdById";

-- AlterTable
ALTER TABLE "QuestionCategory" DROP COLUMN "code",
DROP COLUMN "createdById";

-- AlterTable
ALTER TABLE "QuestionItem" DROP COLUMN "correctKeys",
DROP COLUMN "points",
DROP COLUMN "promptHtml",
ADD COLUMN     "correctKey" TEXT,
ADD COLUMN     "question" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "QuestionPackage" DROP COLUMN "createdById";

-- AlterTable
ALTER TABLE "TemporaryAnswer" DROP COLUMN "selectedKeys",
DROP COLUMN "updatedAt",
ADD COLUMN     "selectedKey" TEXT;

-- CreateIndex
CREATE INDEX "TemporaryAnswer_createdAt_idx" ON "TemporaryAnswer"("createdAt");
