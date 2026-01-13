#!/usr/bin/env bun
/**
 * 最简化的 WebSocket 测试
 */

import WebSocket from 'ws';

const WS_URL = 'ws://localhost:3000';

// 读取环境配置
import envJson from '../env.json' with { type: 'json' };

const JWT_CONFIG = envJson.E2ETests;

import * as jose from 'jose';

async function getWsToken(): Promise<string> {
  // 生成 JWT
  const privateKey = await jose.importPKCS8(JWT_CONFIG.LOCAL_JWT_PRIVATE_KEY, 'EdDSA');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new jose.SignJWT({
    sub: 'test-user-123',
    iss: JWT_CONFIG.LOCAL_JWT_ISSUER,
    'custom:account_id': '7FKrUQyl7K8we76XfdO02f',
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  // 获取 WS token
  const res = await fetch('http://localhost:3000/v1/ws/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
  });
  const data = (await res.json()) as { token: string };
  return data.token;
}

async function main() {
  console.log('1. Getting WS token...');
  const wsToken = await getWsToken();
  console.log('   Got token:', `${wsToken.substring(0, 20)}...`);

  console.log('\n2. Connecting to WebSocket...');
  const ws = new WebSocket(`${WS_URL}?token=${wsToken}`);

  ws.on('open', () => {
    console.log('   ✅ Connected!');

    // 发送消息
    console.log('\n3. Sending ping...');
    ws.send(JSON.stringify({ action: 'ping' }));
  });

  ws.on('message', (data) => {
    console.log('   📩 Received:', data.toString());
  });

  ws.on('error', (err) => {
    console.error('   ❌ Error:', err.message);
  });

  ws.on('close', (code, reason) => {
    console.log(`   🔌 Closed: ${code} ${reason}`);
  });

  // 等待 10 秒
  await new Promise((r) => setTimeout(r, 10000));
  console.log('\n4. Closing...');
  ws.close();
}

main().catch(console.error);
