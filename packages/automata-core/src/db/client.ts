/**
 * DynamoDB Client
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * 环境变量配置
 */
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'automabase-dev';
const REGION = process.env.AWS_REGION || 'ap-northeast-1';

// Check if running locally (SAM Local or LocalStack)
const isLocal = process.env.AWS_SAM_LOCAL === 'true' || process.env.LOCALSTACK === 'true';

// Local endpoint configuration
// Use DYNAMODB_ENDPOINT env var, or default to host.docker.internal for SAM Local
const localEndpoint = process.env.DYNAMODB_ENDPOINT || 'http://host.docker.internal:8000';

/**
 * DynamoDB 客户端配置
 */
function createClientConfig(): ConstructorParameters<typeof DynamoDBClient>[0] {
  if (isLocal) {
    return {
      endpoint: localEndpoint,
      region: REGION,
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local',
      },
    };
  }
  return { region: REGION };
}

/**
 * DynamoDB 原始客户端
 */
export const dynamoDbClient = new DynamoDBClient(createClientConfig());

/**
 * DynamoDB Document 客户端（带类型转换）
 */
export const docClient = DynamoDBDocumentClient.from(dynamoDbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

/**
 * 获取表名
 */
export function getTableName(): string {
  return TABLE_NAME;
}

/**
 * DynamoDB Key 生成工具
 */
export const Keys = {
  // Common
  metaSk: () => '#META',

  // Account
  accountPk: (accountId: string) => `ACCOUNT#${accountId}`,
  accountSk: () => '#META',
  oauthGsi1pk: (provider: string, subject: string) => `OAUTH#${provider}#${subject}`,

  // Automata
  automataPk: (automataId: string) => `AUTOMATA#${automataId}`,
  automataSk: () => '#META',

  // Event
  eventSk: (version: string) => `EVT#${version}`,
  eventTypeLsi1sk: (eventType: string, version: string) => `EVTYPE#${eventType}#${version}`,

  // Snapshot
  snapshotSk: (version: string) => `SNAP#${version}`,

  // Blueprint
  blueprintPk: (blueprintId: string) => `BLUEPRINT#${blueprintId}`,
  blueprintSk: () => '#META',

  // Stats
  statsPk: (statsId: string) => `STATS#${statsId}`,
  statsSk: () => '#META',

  // GSI1: 多用途索引
  accountGsi1sk: () => '#META',
  appGsi1pk: (appId: string) => `APP#${appId}`,
  accountAutomataGsi1pk: (accountId: string) => `ACCOUNT#${accountId}`,

  // GSI2: App 维度索引
  appGsi2pk: (appId: string) => `APP#${appId}`,
} as const;
