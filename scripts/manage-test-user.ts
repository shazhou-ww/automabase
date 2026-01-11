import { spawnSync } from 'bun';

const USER_POOL_ID = process.env.USER_POOL_ID || 'ap-southeast-2_2cTIVAhYG';
const CLIENT_ID = process.env.CLIENT_ID || '6rjt3vskji08mdscm6pqloppmn';
const REGION = process.env.AWS_REGION || 'ap-southeast-2';

const USERNAME = process.argv[2] || 'test@example.com';
const PASSWORD = process.argv[3] || 'TestUser123!';

// Run AWS CLI command
function runAwsCommand(args: string[]) {
  const cmd = ['aws', 'cognito-idp', ...args, '--region', REGION];
  const proc = spawnSync(cmd);
  
  if (proc.exitCode !== 0) {
    const errorText = proc.stderr.toString();
    // Ignore "User already exists" error for create command
    if (args.includes('admin-create-user') && errorText.includes('UsernameExistsException')) {
      return null;
    }
    throw new Error(`Command failed: ${cmd.join(' ')}\n${errorText}`);
  }
  
  const output = proc.stdout.toString().trim();
  return output ? JSON.parse(output) : null;
}

async function main() {
  console.log(`\n🔑 Managing test user: ${USERNAME}`);
  console.log(`   Region: ${REGION}`);
  console.log(`   Pool ID: ${USER_POOL_ID}`);

  try {
    // 1. Create User
    console.log('1️⃣  Creating user...');
    try {
      runAwsCommand([
        'admin-create-user',
        '--user-pool-id', USER_POOL_ID,
        '--username', USERNAME,
        '--message-action', 'SUPPRESS' // Don't send email
      ]);
      console.log('   ✅ User created');
    } catch (e) {
      if ((e as Error).message.includes('UsernameExistsException')) {
        console.log('   ℹ️  User already exists');
      } else {
        // If runAwsCommand didn't catch it (it does currently catch it, but just in case)
        console.log('   ℹ️  User already exists (checked)');
      }
    }

    // 2. Set Password (Permanent)
    console.log('2️⃣  Setting permanent password...');
    runAwsCommand([
      'admin-set-user-password',
      '--user-pool-id', USER_POOL_ID,
      '--username', USERNAME,
      '--password', PASSWORD,
      '--permanent'
    ]);
    console.log('   ✅ Password set');

    // 3. Initiate Auth to get Token
    console.log('3️⃣  Logging in to get tokens...');
    const result = runAwsCommand([
      'initiate-auth',
      '--client-id', CLIENT_ID,
      '--auth-flow', 'USER_PASSWORD_AUTH', 
      '--auth-parameters', `USERNAME=${USERNAME},PASSWORD=${PASSWORD}`
    ]);

    if (result && result.AuthenticationResult) {
      const idToken = result.AuthenticationResult.IdToken;
      console.log('\n✅ Login Successful!');
      console.log('---------------------------------------------------');
      console.log('ID_TOKEN:');
      console.log(idToken);
      console.log('---------------------------------------------------');
      console.log('\n👉 To use in E2E tests:');
      console.log(`export COGNITO_TOKEN='${idToken}'`);
    } else {
      console.error('❌ Login failed:', result);
    }

  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
  }
}

main();
