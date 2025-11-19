/*
  Warnings:

  - You are about to drop the column `mediaId` on the `QuestionItem` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[storageKey]` on the table `MediaAsset` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[pageId,type]` on the table `MediaAsset` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[itemId,type]` on the table `MediaAsset` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `storageKey` to the `MediaAsset` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "QuestionItem" DROP CONSTRAINT "QuestionItem_mediaId_fkey";

-- DropIndex
DROP INDEX "QuestionItem_mediaId_idx";

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "itemId" TEXT,
ADD COLUMN     "pageId" TEXT,
ADD COLUMN     "storageKey" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "QuestionItem" DROP COLUMN "mediaId";

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_pageId_type_key" ON "MediaAsset"("pageId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_itemId_type_key" ON "MediaAsset"("itemId", "type");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "QuestionPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "QuestionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
