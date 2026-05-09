/*
  Warnings:

  - You are about to drop the column `completionTokens` on the `ai_usage_log` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ai_usage_log` table. All the data in the column will be lost.
  - You are about to drop the column `durationMs` on the `ai_usage_log` table. All the data in the column will be lost.
  - You are about to drop the column `entityId` on the `ai_usage_log` table. All the data in the column will be lost.
  - You are about to drop the column `errorMessage` on the `ai_usage_log` table. All the data in the column will be lost.
  - You are about to drop the column `isSuccess` on the `ai_usage_log` table. All the data in the column will be lost.
  - You are about to drop the column `modelName` on the `ai_usage_log` table. All the data in the column will be lost.
  - You are about to drop the column `promptTokens` on the `ai_usage_log` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `ai_usage_log` table. All the data in the column will be lost.
  - Added the required column `model_name` to the `ai_usage_log` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ai_usage_log_modelName_idx";

-- DropIndex
DROP INDEX "ai_usage_log_userId_idx";

-- AlterTable
ALTER TABLE "ai_usage_log" DROP COLUMN "completionTokens",
DROP COLUMN "createdAt",
DROP COLUMN "durationMs",
DROP COLUMN "entityId",
DROP COLUMN "errorMessage",
DROP COLUMN "isSuccess",
DROP COLUMN "modelName",
DROP COLUMN "promptTokens",
DROP COLUMN "userId",
ADD COLUMN     "completion_tokens" INTEGER,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "duration_ms" INTEGER,
ADD COLUMN     "entity_id" TEXT,
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "is_success" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "model_name" TEXT NOT NULL,
ADD COLUMN     "prompt_tokens" INTEGER,
ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE INDEX "ai_usage_log_model_name_idx" ON "ai_usage_log"("model_name");

-- CreateIndex
CREATE INDEX "ai_usage_log_user_id_idx" ON "ai_usage_log"("user_id");
