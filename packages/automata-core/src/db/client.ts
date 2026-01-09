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
const ENDPOINT = process.env.DYNAMODB_ENDPOINT; // 本地开发使用

/**
 * DynamoDB 客户端配置
 */
const clientConfig: ConstructorParameters<typeof DynamoDBClient>[0] = {
  region: REGION,
};

if (ENDPOINT) {
  clientConfig.endpoint = ENDPOINT;
}

/**
 * DynamoDB 原始客户端
 */
export const dynamoDbClient = new DynamoDBClient(clientConfig);

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
  // Account
  accountPk: (accountId: string) => `ACCOUNT#${accountId}`,
  accountSk: () => '#META',
  oauthGsi1pk: (provider: string, subject: string) => `OAUTH#${provider}#${subject}`,
  
  // Automata
  automataPk: (automataId: string) => `AUTOMATA#${automataId}`,
  automataSk: () => '#META',
  
  // Event
  eventSk: (version: string) => `EVT#${version}`,
  
  // Snapshot
  snapshotSk: (version: string) => `SNAP#${version}`,
  
  // Blueprint
  blueprintPk: (blueprintId: string) => `BLUEPRINT#${blueprintId}`,
  blueprintSk: () => '#META',
  
  // Stats
  statsPk: (statsId: string) => `STATS#${statsId}`,
  statsSk: () => '#META',
  
  // GSI
  accountGsi1sk: () => '#META',
  appGsi1pk: (appId: string) => `APP#${appId}`,
  accountAutomataGsi1pk: (accountId: string) => `ACCOUNT#${accountId}`,
} as const;

