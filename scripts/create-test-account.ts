#!/usr/bin/env bun
/**
 * Create a test account in local DynamoDB
 * 
 * This script creates a test user account directly in DynamoDB Local
 * for local WebSocket development.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as crypto from 'node:crypto';

const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const TABLE_NAME = 'automabase-dev';

// Test account details
const TEST_ACCOUNT_ID = 'acc_local_test_001';
const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_ID = crypto.randomUUID();

async function createTestAccount() {
  console.log('📝 Creating test account in DynamoDB Local...\n');

  const client = new DynamoDBClient({
    region: 'ap-northeast-1',
    endpoint: DYNAMODB_ENDPOINT,
    credentials: {
      accessKeyId: 'local',
      secretAccessKey: 'local',
    },
  });

  const docClient = DynamoDBDocumentClient.from(client);

  try {
    // 1. Create account
    console.log('1️⃣  Creating account...');
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `account#${TEST_ACCOUNT_ID}`,
          sk: 'meta',
          id: TEST_ACCOUNT_ID,
          name: 'Test Account',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'active',
          ttl: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year
        },
      })
    );
    console.log(`   ✓ Account created: ${TEST_ACCOUNT_ID}\n`);

    // 2. Create user
    console.log('2️⃣  Creating user...');
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `account#${TEST_ACCOUNT_ID}`,
          sk: `user#${TEST_USER_ID}`,
          id: TEST_USER_ID,
          email: TEST_USER_EMAIL,
          role: 'owner',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        },
      })
    );
    console.log(`   ✓ User created: ${TEST_USER_EMAIL}\n`);

    console.log('✅ Test account setup complete!\n');
    console.log('📋 Account Details:');
    console.log(`   Account ID: ${TEST_ACCOUNT_ID}`);
    console.log(`   User Email: ${TEST_USER_EMAIL}`);
    console.log(`   User ID: ${TEST_USER_ID}`);
    console.log('');
    console.log('🎯 You can now use the JWT token to access WebSocket endpoints.');
    console.log('');

  } catch (err) {
    console.error('❌ Error creating account:', err);
    process.exit(1);
  }
}

createTestAccount();
