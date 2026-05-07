-- AlterTable
ALTER TABLE "course_to_tag" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "note_to_tag" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'APPROVED';
