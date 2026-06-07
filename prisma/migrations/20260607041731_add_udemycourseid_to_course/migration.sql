/*
  Warnings:

  - A unique constraint covering the columns `[user_id,udemy_course_id]` on the table `course` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "course" ADD COLUMN     "udemy_course_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "course_user_id_udemy_course_id_key" ON "course"("user_id", "udemy_course_id");
