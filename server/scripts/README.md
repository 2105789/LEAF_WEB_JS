# Database Management Scripts

This directory contains scripts for managing the database.

## Reset Database Script

The `resetDatabase.js` script allows you to reset the database while preserving the user table. This is useful when you want to clear all conversation data but keep user accounts intact.

### Usage

Run the script using npm:

```bash
npm run reset-db
```

### What it does

The script performs the following actions:

1. Deletes all messages from the database
2. Deletes all threads from the database
3. Preserves the user table and all user data

### When to use

Use this script when:
- You need to clear conversation history for all users
- You want to reset the application state while keeping user accounts
- You're experiencing issues with the chat data but want to preserve user accounts

### Caution

This operation cannot be undone. All message and thread data will be permanently deleted. 