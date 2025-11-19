/*
  Warnings:

  - The `answerText` column on the `QuestionItem` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `textAnswer` column on the `TemporaryAnswer` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "QuestionItem" DROP COLUMN "answerText",
ADD COLUMN     "answerText" JSONB;

-- AlterTable
ALTER TABLE "TemporaryAnswer" DROP COLUMN "textAnswer",
ADD COLUMN     "textAnswer" JSONB;
