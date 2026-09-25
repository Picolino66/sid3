-- CreateEnum
CREATE TYPE "Sid3RootFolderStatus" AS ENUM ('NOT_RESOLVED', 'PENDING_CONFIRMATION', 'CONFIRMED');

-- AlterTable
ALTER TABLE "provider_integrations" ADD COLUMN     "sid3_root_folder_ref" TEXT,
ADD COLUMN     "sid3_root_folder_status" "Sid3RootFolderStatus" NOT NULL DEFAULT 'NOT_RESOLVED';
