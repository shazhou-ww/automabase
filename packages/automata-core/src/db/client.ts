/**
 * DynamoDB Client
 *
 * 使用懒加载模式，在首次调用时读取环境变量初始化客户端。
 * 这样可以确保 dev-gateway 设置的环境变量能正确生效。
 */

import type { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB 客户端配置（懒加载）
 * 在调用时读取环境变量，而不是模块加载时
 */
function createClientConfig(): DynamoDBClientConfig {
  const tableName = process.env.AUTOMABASE_TABLE || 'automabase-dev';
  const region = process.env.AWS_REGION || 'ap-northeast-1';
  const dynamodbEndpoint = process.env.DYNAMODB_ENDPOINT;

  // Check if running locally
  const isLocal =
    process.env.AWS_SAM_LOCAL === 'true' || process.env.LOCALSTACK === 'true' || !!dynamodbEndpoint;

  if (isLocal) {
    const endpoint = dynamodbEndpoint || 'http://host.docker.internal:3200';
    console.log(`[DynamoDB] Using local endpoint: ${endpoint}, table: ${tableName}`);
    return {
      endpoint,
      region,
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local',
      },
    };
  }
  return { region };
}

// 懒加载客户端实例
let _dynamoDbClient: DynamoDBClient | null = null;
let _docClient: DynamoDBDocumentClient | null = null;

/**
 * 获取 DynamoDB 原始客户端（懒加载）
 */
export function getDynamoDbClient(): DynamoDBClient {
  if (!_dynamoDbClient) {
    _dynamoDbClient = new DynamoDBClient(createClientConfig());
  }
  return _dynamoDbClient;
}

/**
 * 获取 DynamoDB Document 客户端（懒加载）
 */
export function getDocClient(): DynamoDBDocumentClient {
  if (!_docClient) {
    _docClient = DynamoDBDocumentClient.from(getDynamoDbClient(), {
      marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: false,
      },
      unmarshallOptions: {
        wrapNumbers: false,
      },
    });
  }
  return _docClient;
}

/**
 * DynamoDB 原始客户端（向后兼容，使用 getter）
 * @deprecated 使用 getDynamoDbClient() 代替
 */
export const dynamoDbClient = new Proxy({} as DynamoDBClient, {
  get(_, prop) {
    return Reflect.get(getDynamoDbClient(), prop);
  },
});

/**
 * DynamoDB Document 客户端（向后兼容，使用 getter）
 * @deprecated 使用 getDocClient() 代替
 */
export const docClient = new Proxy({} as DynamoDBDocumentClient, {
  get(_, prop) {
    return Reflect.get(getDocClient(), prop);
  },
});

/**
 * 获取表名（懒加载）
 */
export function getTableName(): string {
  return process.env.AUTOMABASE_TABLE || 'automabase-dev';
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

  // Device
  deviceSk: (deviceId: string) => `DEVICE#${deviceId}`,
  deviceGsi1pk: (publicKey: string) => `DEVICE#PUBKEY#${publicKey}`,

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
