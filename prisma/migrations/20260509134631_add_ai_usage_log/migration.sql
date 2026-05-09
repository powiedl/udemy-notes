-- CreateTable
CREATE TABLE "ai_usage_log" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelName" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "entityId" TEXT,
    "userId" TEXT,
    "durationMs" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "isSuccess" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,

    CONSTRAINT "ai_usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_log_modelName_idx" ON "ai_usage_log"("modelName");

-- CreateIndex
CREATE INDEX "ai_usage_log_feature_idx" ON "ai_usage_log"("feature");

-- CreateIndex
CREATE INDEX "ai_usage_log_userId_idx" ON "ai_usage_log"("userId");
