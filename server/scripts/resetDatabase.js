import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetDatabase() {
  console.log('Starting database reset...')
  
  try {
    // Delete all messages
    console.log('Deleting messages...')
    await prisma.message.deleteMany({})
    console.log('All messages deleted successfully')
    
    // Delete all threads
    console.log('Deleting threads...')
    await prisma.thread.deleteMany({})
    console.log('All threads deleted successfully')
    
    // Keep the user table intact
    console.log('User table preserved')
    
    console.log('Database reset completed successfully!')
  } catch (error) {
    console.error('Error resetting database:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// Execute the reset function
resetDatabase()
  .then(() => {
    console.log('Reset script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Reset script failed:', error)
    process.exit(1)
  }) 