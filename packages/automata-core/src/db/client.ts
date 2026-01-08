/**
 * DynamoDB Client Configuration
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Check if running locally (SAM Local or LocalStack)
const isLocal = process.env.AWS_SAM_LOCAL === 'true' || process.env.LOCALSTACK === 'true';

// Local endpoint configuration
const localEndpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';

/**
 * Create DynamoDB client with appropriate configuration
 */
export function createDynamoDBClient(): DynamoDBClient {
  if (isLocal) {
    return new DynamoDBClient({
      endpoint: localEndpoint,
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local',
      },
    });
  }

  return new DynamoDBClient({});
}

/**
 * Create DynamoDB Document Client
 */
export function createDocClient(client?: DynamoDBClient): DynamoDBDocumentClient {
  const dynamoClient = client ?? createDynamoDBClient();

  return DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
    unmarshallOptions: {
      wrapNumbers: false,
    },
  });
}

// Singleton instances
let _dynamoClient: DynamoDBClient | null = null;
let _docClient: DynamoDBDocumentClient | null = null;

/**
 * Get singleton DynamoDB client
 */
export function getDynamoDBClient(): DynamoDBClient {
  if (!_dynamoClient) {
    _dynamoClient = createDynamoDBClient();
  }
  return _dynamoClient;
}

/**
 * Get singleton Document client
 */
export function getDocClient(): DynamoDBDocumentClient {
  if (!_docClient) {
    _docClient = createDocClient(getDynamoDBClient());
  }
  return _docClient;
}

/**
 * Reset clients (useful for testing)
 */
export function resetClients(): void {
  _dynamoClient = null;
  _docClient = null;
}
