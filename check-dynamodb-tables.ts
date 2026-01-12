#!/usr/bin/env bun
/**
 * Check if DynamoDB Local tables exist
 */

import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';

const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';

const client = new DynamoDBClient({
  region: 'ap-northeast-1',
  endpoint: DYNAMODB_ENDPOINT,
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
});

async function listTables() {
  try {
    const result = await client.send(new ListTablesCommand({}));
    console.log('📋 Tables in DynamoDB Local:');
    if (result.TableNames && result.TableNames.length > 0) {
      result.TableNames.forEach(table => console.log(`   ✓ ${table}`));
    } else {
      console.log('   (No tables found)');
    }
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

listTables();
