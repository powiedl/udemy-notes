-- CreateTable
CREATE TABLE "course_share_token" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_share_token_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "course_share_token" ADD CONSTRAINT "course_share_token_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
