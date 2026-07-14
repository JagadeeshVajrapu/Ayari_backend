-- AlterTable
ALTER TABLE \"products\" ADD COLUMN IF NOT EXISTS \"sizes\" TEXT[] DEFAULT ARRAY[]::TEXT[];
