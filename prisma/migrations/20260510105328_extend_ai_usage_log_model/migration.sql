-- AlterTable
ALTER TABLE "ai_usage_log" ADD COLUMN     "entity_count" INTEGER,
ADD COLUMN     "error_code" INTEGER,
ADD COLUMN     "metadata" JSONB;

-- CreateIndex
CREATE INDEX "ai_usage_log_created_at_idx" ON "ai_usage_log"("created_at");
