-- Add new fields to Thread table
ALTER TABLE "Thread" ADD COLUMN "lastContext" TEXT;
ALTER TABLE "Thread" ADD COLUMN "keyTopics" TEXT[];
ALTER TABLE "Thread" ADD COLUMN "lastMessageId" INTEGER UNIQUE;

-- Add foreign key constraint for lastMessageId
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_lastMessageId_fkey" FOREIGN KEY ("lastMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add new fields to Message table
ALTER TABLE "Message" ADD COLUMN "contextScore" DOUBLE PRECISION;
ALTER TABLE "Message" ADD COLUMN "parentMsgId" INTEGER;
ALTER TABLE "Message" ADD COLUMN "messageType" TEXT;
ALTER TABLE "Message" ALTER COLUMN "content" TYPE TEXT; 