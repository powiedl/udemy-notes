/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `trainer` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "trainer_name_key" ON "trainer"("name");
