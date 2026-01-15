/**
 * Account Repository
 *
 * DynamoDB 操作封装
 */

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type {
  Account,
  AccountItem,
  CreateAccountInput,
  UpdateAccountInput,
} from '../types/account';
import { generateAccountId } from '../types/account';
import { docClient, getTableName, Keys } from './client';

/**
 * Account Repository 错误
 */
export class AccountNotFoundError extends Error {
  constructor(accountId: string) {
    super(`Account not found: ${accountId}`);
    this.name = 'AccountNotFoundError';
  }
}

export class AccountAlreadyExistsError extends Error {
  constructor(accountId: string) {
    super(`Account already exists: ${accountId}`);
    this.name = 'AccountAlreadyExistsError';
  }
}

export class OAuthAccountAlreadyExistsError extends Error {
  constructor(provider: string, subject: string) {
    super(`OAuth account already exists: ${provider}:${subject}`);
    this.name = 'OAuthAccountAlreadyExistsError';
  }
}

/**
 * 将 DynamoDB Item 转换为 Account
 */
function itemToAccount(item: AccountItem): Account {
  const { pk, sk, gsi1pk, gsi1sk, ...account } = item;
  return account;
}

/**
 * 创建 Account
 */
export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const now = new Date().toISOString();
  const accountId = generateAccountId();

  const account: Account = {
    accountId,
    oauthSubject: input.oauthSubject,
    oauthProvider: input.oauthProvider,
    displayName: input.displayName,
    email: input.email,
    avatarUrl: input.avatarUrl,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const item: AccountItem = {
    ...account,
    pk: Keys.accountPk(accountId),
    sk: Keys.accountSk(),
    gsi1pk: Keys.oauthGsi1pk(input.oauthProvider, input.oauthSubject),
    gsi1sk: Keys.accountGsi1sk(),
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: getTableName(),
        Item: item,
        ConditionExpression: 'attribute_not_exists(pk)',
      })
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      throw new AccountAlreadyExistsError(accountId);
    }
    throw error;
  }

  return account;
}

/**
 * 根据 Account ID 获取 Account
 */
export async function getAccountById(accountId: string): Promise<Account | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        pk: Keys.accountPk(accountId),
        sk: Keys.accountSk(),
      },
    })
  );

  if (!result.Item) {
    return null;
  }

  return itemToAccount(result.Item as AccountItem);
}

/**
 * 根据 OAuth 信息获取 Account
 */
export async function getAccountByOAuth(
  provider: string,
  subject: string
): Promise<Account | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      IndexName: 'gsi1-multipurpose-index',
      KeyConditionExpression: 'gsi1pk = :pk AND gsi1sk = :sk',
      ExpressionAttributeValues: {
        ':pk': Keys.oauthGsi1pk(provider, subject),
        ':sk': Keys.accountGsi1sk(),
      },
      Limit: 1,
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  return itemToAccount(result.Items[0] as AccountItem);
}

/**
 * 更新 Account
 */
export async function updateAccount(
  accountId: string,
  input: UpdateAccountInput
): Promise<Account> {
  const now = new Date().toISOString();

  // 构建更新表达式
  const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
  const expressionAttributeNames: Record<string, string> = {
    '#updatedAt': 'updatedAt',
  };
  const expressionAttributeValues: Record<string, unknown> = {
    ':updatedAt': now,
  };

  if (input.displayName !== undefined) {
    updateExpressions.push('#displayName = :displayName');
    expressionAttributeNames['#displayName'] = 'displayName';
    expressionAttributeValues[':displayName'] = input.displayName;
  }

  if (input.email !== undefined) {
    updateExpressions.push('#email = :email');
    expressionAttributeNames['#email'] = 'email';
    expressionAttributeValues[':email'] = input.email;
  }

  if (input.avatarUrl !== undefined) {
    updateExpressions.push('#avatarUrl = :avatarUrl');
    expressionAttributeNames['#avatarUrl'] = 'avatarUrl';
    expressionAttributeValues[':avatarUrl'] = input.avatarUrl;
  }

  if (input.status !== undefined) {
    updateExpressions.push('#status = :status');
    expressionAttributeNames['#status'] = 'status';
    expressionAttributeValues[':status'] = input.status;
  }

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: getTableName(),
        Key: {
          pk: Keys.accountPk(accountId),
          sk: Keys.accountSk(),
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(pk)',
        ReturnValues: 'ALL_NEW',
      })
    );

    if (!result.Attributes) {
      throw new AccountNotFoundError(accountId);
    }

    return itemToAccount(result.Attributes as AccountItem);
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      throw new AccountNotFoundError(accountId);
    }
    throw error;
  }
}

/**
 * 获取或创建 Account（用于 OAuth 登录）
 *
 * 如果 OAuth 用户已存在，返回现有 Account
 * 如果不存在，创建新 Account
 */
export async function getOrCreateAccountByOAuth(
  input: CreateAccountInput
): Promise<{ account: Account; isNew: boolean }> {
  // 先查询是否已存在
  const existing = await getAccountByOAuth(input.oauthProvider, input.oauthSubject);

  if (existing) {
    return { account: existing, isNew: false };
  }

  // 创建新账户
  const account = await createAccount(input);
  return { account, isNew: true };
}
