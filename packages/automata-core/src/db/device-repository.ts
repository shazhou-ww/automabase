/**
 * Device Repository
 *
 * DynamoDB 操作封装，处理 Device 的 CRUD
 */

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Device, DeviceItem, RegisterDeviceInput, UpdateDeviceInput } from '../types/device';
import { generateDeviceId } from '../types/device';
import { docClient, getTableName, Keys } from './client';

/**
 * Device Repository 错误
 */
export class DeviceNotFoundError extends Error {
  constructor(deviceId: string) {
    super(`Device not found: ${deviceId}`);
    this.name = 'DeviceNotFoundError';
  }
}

export class DeviceAlreadyExistsError extends Error {
  constructor(_publicKey: string) {
    super(`Device with this public key already exists`);
    this.name = 'DeviceAlreadyExistsError';
  }
}

export class DeviceRevokedError extends Error {
  constructor(deviceId: string) {
    super(`Device is revoked: ${deviceId}`);
    this.name = 'DeviceRevokedError';
  }
}

/**
 * 将 DynamoDB Item 转换为 Device
 */
function itemToDevice(item: DeviceItem): Device {
  const { pk, sk, gsi1pk, gsi1sk, ...device } = item;
  return device;
}

/**
 * 注册新 Device
 */
export async function registerDevice(input: RegisterDeviceInput): Promise<Device> {
  const now = new Date().toISOString();
  const deviceId = generateDeviceId();

  const device: Device = {
    deviceId,
    accountId: input.accountId,
    publicKey: input.publicKey,
    deviceName: input.deviceName,
    deviceType: input.deviceType,
    status: 'active',
    createdAt: now,
    lastActiveAt: now,
    updatedAt: now,
  };

  const item: DeviceItem = {
    ...device,
    pk: Keys.accountPk(input.accountId),
    sk: Keys.deviceSk(deviceId),
    gsi1pk: Keys.deviceGsi1pk(input.publicKey),
    gsi1sk: Keys.metaSk(),
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: getTableName(),
        Item: item,
        // 确保同一个公钥不会注册到多个设备
        ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
      })
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      throw new DeviceAlreadyExistsError(input.publicKey);
    }
    throw error;
  }

  return device;
}

/**
 * 根据 Account ID 和 Device ID 获取 Device
 */
export async function getDeviceById(accountId: string, deviceId: string): Promise<Device | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        pk: Keys.accountPk(accountId),
        sk: Keys.deviceSk(deviceId),
      },
    })
  );

  if (!result.Item) {
    return null;
  }

  return itemToDevice(result.Item as DeviceItem);
}

/**
 * 根据公钥获取 Device（用于验证签名时查找设备）
 */
export async function getDeviceByPublicKey(publicKey: string): Promise<Device | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      IndexName: 'gsi1-multipurpose-index',
      KeyConditionExpression: 'gsi1pk = :pk AND gsi1sk = :sk',
      ExpressionAttributeValues: {
        ':pk': Keys.deviceGsi1pk(publicKey),
        ':sk': Keys.metaSk(),
      },
      Limit: 1,
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  return itemToDevice(result.Items[0] as DeviceItem);
}

/**
 * 列出 Account 下的所有 Device
 */
export async function listDevicesByAccountId(accountId: string): Promise<Device[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': Keys.accountPk(accountId),
        ':skPrefix': 'DEVICE#',
      },
    })
  );

  if (!result.Items) {
    return [];
  }

  return result.Items.map((item) => itemToDevice(item as DeviceItem));
}

/**
 * 列出 Account 下的活跃 Device
 */
export async function listActiveDevicesByAccountId(accountId: string): Promise<Device[]> {
  const devices = await listDevicesByAccountId(accountId);
  return devices.filter((d) => d.status === 'active');
}

/**
 * 更新 Device
 */
export async function updateDevice(
  accountId: string,
  deviceId: string,
  input: UpdateDeviceInput
): Promise<Device> {
  const now = new Date().toISOString();

  const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
  const expressionNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const expressionValues: Record<string, unknown> = { ':updatedAt': now };

  if (input.deviceName !== undefined) {
    updateExpressions.push('#deviceName = :deviceName');
    expressionNames['#deviceName'] = 'deviceName';
    expressionValues[':deviceName'] = input.deviceName;
  }

  if (input.deviceType !== undefined) {
    updateExpressions.push('#deviceType = :deviceType');
    expressionNames['#deviceType'] = 'deviceType';
    expressionValues[':deviceType'] = input.deviceType;
  }

  if (input.status !== undefined) {
    updateExpressions.push('#status = :status');
    expressionNames['#status'] = 'status';
    expressionValues[':status'] = input.status;
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: {
        pk: Keys.accountPk(accountId),
        sk: Keys.deviceSk(deviceId),
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
      ConditionExpression: 'attribute_exists(pk)',
      ReturnValues: 'ALL_NEW',
    })
  );

  if (!result.Attributes) {
    throw new DeviceNotFoundError(deviceId);
  }

  return itemToDevice(result.Attributes as DeviceItem);
}

/**
 * 更新 Device 最后活跃时间
 */
export async function touchDevice(accountId: string, deviceId: string): Promise<void> {
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: {
        pk: Keys.accountPk(accountId),
        sk: Keys.deviceSk(deviceId),
      },
      UpdateExpression: 'SET #lastActiveAt = :now, #updatedAt = :now',
      ExpressionAttributeNames: {
        '#lastActiveAt': 'lastActiveAt',
        '#updatedAt': 'updatedAt',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':now': now,
        ':active': 'active',
      },
      ConditionExpression: 'attribute_exists(pk) AND #status = :active',
    })
  );
}

/**
 * 撤销 Device（软删除）
 */
export async function revokeDevice(accountId: string, deviceId: string): Promise<Device> {
  return updateDevice(accountId, deviceId, { status: 'revoked' });
}

/**
 * 删除 Device（硬删除，谨慎使用）
 */
export async function deleteDevice(accountId: string, deviceId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: getTableName(),
      Key: {
        pk: Keys.accountPk(accountId),
        sk: Keys.deviceSk(deviceId),
      },
    })
  );
}
