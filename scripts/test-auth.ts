#!/usr/bin/env bun
/**
 * 本地测试 Cognito 认证流程
 * 
 * 使用方式:
 *   1. 部署后测试: bun scripts/test-auth.ts --token {your-cognito-id-token}
 *   2. Mock 测试:   bun scripts/test-auth.ts --mock
 */

import { SignJWT, generateKeyPair } from 'jose';

const MOCK_USER = {
  sub: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.jpg',
};

async function createMockToken(): Promise<string> {
  // 生成临时密钥对
  const { privateKey } = await generateKeyPair('RS256');
  
  const token = await new SignJWT({
    ...MOCK_USER,
    token_use: 'id',
    auth_time: Math.floor(Date.now() / 1000),
    'custom:account_id': undefined, // 未注册用户
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer('https://cognito-idp.ap-northeast-1.amazonaws.com/test-pool')
    .setAudience('test-client')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
  
  return token;
}

async function testWithMock() {
  console.log('🔐 创建 Mock JWT Token...\n');
  const token = await createMockToken();
  
  console.log('📋 Token (前 100 字符):');
  console.log(token.substring(0, 100) + '...\n');
  
  console.log('📦 Token Payload:');
  const [, payload] = token.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
  console.log(JSON.stringify(decoded, null, 2));
  
  console.log('\n✅ Mock Token 创建成功！');
  console.log('\n💡 提示: Mock Token 无法通过真实验证，因为签名密钥不匹配');
  console.log('   要进行真实测试，请部署到 AWS 并使用 Cognito Hosted UI 获取真实 Token');
}

async function testWithRealToken(token: string) {
  console.log('🔐 解析真实 Token...\n');
  
  const [, payload] = token.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
  
  console.log('📦 Token Payload:');
  console.log(JSON.stringify(decoded, null, 2));
  
  console.log('\n📋 关键信息:');
  console.log(`  - Cognito User ID (sub): ${decoded.sub}`);
  console.log(`  - Email: ${decoded.email || '(not provided)'}`);
  console.log(`  - Name: ${decoded.name || '(not provided)'}`);
  console.log(`  - Issuer: ${decoded.iss}`);
  console.log(`  - Expires: ${new Date(decoded.exp * 1000).toISOString()}`);
  
  if (decoded['custom:account_id']) {
    console.log(`  - Automabase Account ID: ${decoded['custom:account_id']}`);
  } else {
    console.log('  - Automabase Account ID: (not registered yet)');
  }
  
  if (decoded.identities) {
    console.log(`  - Identity Provider: ${decoded.identities[0]?.providerName}`);
  }
}

async function showCognitoLoginUrl() {
  console.log('\n🌐 Cognito Hosted UI 登录 URL 模板:\n');
  console.log(`https://{DOMAIN}.auth.{REGION}.amazoncognito.com/login?`);
  console.log(`  client_id={CLIENT_ID}&`);
  console.log(`  response_type=code&`);
  console.log(`  scope=email+openid+profile&`);
  console.log(`  redirect_uri=http://localhost:3000/callback`);
  
  console.log('\n📝 部署后，从 CloudFormation Outputs 获取以下值:');
  console.log('  - DOMAIN: UserPoolDomainUrl 中的域名部分');
  console.log('  - REGION: AWS Region (如 ap-northeast-1)');
  console.log('  - CLIENT_ID: UserPoolClientId');
}

// Main
const args = process.argv.slice(2);

if (args.includes('--mock')) {
  await testWithMock();
  await showCognitoLoginUrl();
} else if (args.includes('--token')) {
  const tokenIndex = args.indexOf('--token');
  const token = args[tokenIndex + 1];
  if (!token) {
    console.error('❌ 请提供 token: bun scripts/test-auth.ts --token {your-token}');
    process.exit(1);
  }
  await testWithRealToken(token);
} else {
  console.log('🔐 Cognito 认证测试工具\n');
  console.log('用法:');
  console.log('  bun scripts/test-auth.ts --mock          创建并解析 Mock Token');
  console.log('  bun scripts/test-auth.ts --token {jwt}   解析真实 Cognito Token');
  await showCognitoLoginUrl();
}

