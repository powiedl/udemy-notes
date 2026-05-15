/*
  Warnings:

  - A unique constraint covering the columns `[profile_url]` on the table `trainer` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "trainer_name_key";

-- AlterTable
ALTER TABLE "course" ADD COLUMN     "course_url" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "image_url" TEXT;

-- AlterTable
ALTER TABLE "trainer" ADD COLUMN     "profile_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "trainer_profile_url_key" ON "trainer"("profile_url");
