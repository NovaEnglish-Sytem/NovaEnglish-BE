/*
  Warnings:

  - You are about to drop the column `createdAt` on the `TestAttempt` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `TestAttempt` table. All the data in the column will be lost.
  - You are about to drop the `StudentPackageHistory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "StudentPackageHistory" DROP CONSTRAINT "StudentPackageHistory_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "StudentPackageHistory" DROP CONSTRAINT "StudentPackageHistory_packageId_fkey";

-- DropForeignKey
ALTER TABLE "StudentPackageHistory" DROP CONSTRAINT "StudentPackageHistory_studentId_fkey";

-- AlterTable
ALTER TABLE "TestAttempt" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt";

-- DropTable
DROP TABLE "StudentPackageHistory";
