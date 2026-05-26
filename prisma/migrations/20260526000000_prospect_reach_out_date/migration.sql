-- Add reachOutDate to ClientProfile for prospect follow-up scheduling
ALTER TABLE "ClientProfile" ADD COLUMN "reachOutDate" TIMESTAMP(3);
