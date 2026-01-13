#!/usr/bin/env bun

/**
 * 诊断 WebSocket 订阅和广播问题
 */

import * as jose from 'jose';
import WebSocket from 'ws';
// 直接从 e2e 导入 helpers
import { APP_REGISTRY_BLUEPRINT } from '../e2e/src/helpers';

const API_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

// 读取环境配置
import envJson from '../env.json' with { type: 'json' };

const JWT_CONFIG = envJson.E2ETests;

async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  // Use jose to generate EdDSA key pair, then extract raw bytes
  const { publicKey, privateKey } = await jose.generateKeyPair('EdDSA', {
    crv: 'Ed25519',
    extractable: true,
  });
  const pubJwk = await jose.exportJWK(publicKey);
  const privJwk = await jose.exportJWK(privateKey);
  // x is the public key in base64url format (32 bytes for Ed25519)
  return {
    publicKey: pubJwk.x as string,
    privateKey: privJwk.d as string,
  };
}

// 生成 JWT
async function generateToken(accountId: string): Promise<string> {
  const privateKey = await jose.importPKCS8(JWT_CONFIG.LOCAL_JWT_PRIVATE_KEY, 'EdDSA');
  const now = Math.floor(Date.now() / 1000);

  return new jose.SignJWT({
    sub: 'test-user-123',
    iss: JWT_CONFIG.LOCAL_JWT_ISSUER,
    'custom:account_id': accountId,
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
}

async function httpRequest(method: string, path: string, token: string, body?: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => res.text()) };
}

async function main() {
  console.log('🔍 WebSocket 订阅诊断\n');

  // 生成 account key pair
  const { publicKey: accountPublicKey } = await generateKeyPair();

  // 1. 创建 Account
  console.log('1️⃣ 创建测试 Account...');
  const initialToken = await generateToken('will-be-replaced');
  const accountRes = await httpRequest('POST', '/v1/accounts', initialToken, {
    name: 'WS Diag Test',
    publicKey: accountPublicKey,
  });
  console.log('   Account:', accountRes.status, accountRes.data);
  if (accountRes.status !== 201 && accountRes.status !== 200) {
    console.error('   ❌ Failed to create account');
    process.exit(1);
  }
  const accountId = accountRes.data.account?.accountId || accountRes.data.accountId;
  const token = await generateToken(accountId);

  // 2. 创建 Automata (使用内置 AppRegistry blueprint)
  console.log('\n2️⃣ 创建 Automata...');
  const automataRes = await httpRequest('POST', `/v1/accounts/${accountId}/automatas`, token, {
    blueprint: APP_REGISTRY_BLUEPRINT,
  });
  console.log('   Automata:', automataRes.status, automataRes.data);
  if (automataRes.status !== 201 && automataRes.status !== 200) {
    console.error('   ❌ Failed to create automata');
    process.exit(1);
  }
  const automataId = automataRes.data.automataId;

  // 3. 获取 WS Token
  console.log('\n3️⃣ 获取 WS Token...');
  const wsTokenRes = await httpRequest('POST', '/v1/ws/token', token);
  console.log(
    '   WS Token:',
    wsTokenRes.status,
    wsTokenRes.data?.token ? 'got token' : wsTokenRes.data
  );
  if (wsTokenRes.status !== 200) {
    console.error('   ❌ Failed to get ws token');
    process.exit(1);
  }
  const wsToken = wsTokenRes.data.token;

  // 4. 连接 WebSocket
  console.log('\n4️⃣ 连接 WebSocket...');
  const ws = new WebSocket(`${WS_URL}?token=${wsToken}`);

  const messages: any[] = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('   📩 Received:', JSON.stringify(msg));
    messages.push(msg);
  });

  ws.on('error', (err) => {
    console.log('   ⚠️ WS Error:', err);
  });

  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
  console.log('   ✅ Connected');

  // 5. 订阅 Automata
  console.log('\n5️⃣ 订阅 Automata... (automataId:', automataId, ')');

  // 添加小延迟确保连接完全就绪
  await new Promise((r) => setTimeout(r, 500));

  const subscribeMsg = {
    action: 'subscribe',
    automataId,
  };
  console.log('   Sending:', JSON.stringify(subscribeMsg));
  ws.send(JSON.stringify(subscribeMsg));
  console.log('   Message sent, readyState:', ws.readyState);

  // 等待订阅确认 (增加超时时间并显示所有收到的消息)
  console.log('   Waiting for subscribed confirmation...');
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.log('   Current messages:', messages);
      reject(new Error('Subscribe timeout'));
    }, 10000);
    const check = () => {
      if (messages.some((m) => m.type === 'subscribed')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    ws.on('message', check);
  });
  console.log('   ✅ Subscribed');

  // 6. 发送事件
  console.log('\n6️⃣ 发送事件 (HTTP)...');
  const eventRes = await httpRequest(
    'POST',
    `/v1/accounts/${accountId}/automatas/${automataId}/events`,
    token,
    {
      eventType: 'SET_INFO',
      eventData: {
        name: 'Updated Name',
      },
    }
  );
  console.log('   Event:', eventRes.status, eventRes.data);

  // 7. 等待推送
  console.log('\n7️⃣ 等待 state_update 推送...');
  const startTime = Date.now();
  const timeout = 10000;

  while (Date.now() - startTime < timeout) {
    if (messages.some((m) => m.type === 'state_update')) {
      console.log('   ✅ Received state_update!');
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!messages.some((m) => m.type === 'state_update')) {
    console.log('   ❌ Timeout - no state_update received');
    console.log('\n📋 All received messages:', messages);
  }

  ws.close();
  console.log('\n✅ Done');
}

main().catch(console.error);
