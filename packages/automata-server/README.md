# @automabase/automata-server

Server-side SDK for automata descriptor signing and server utilities.

## Overview

This SDK is designed to be used by tenant authentication services to sign automata descriptors before they are sent to clients. The signature ensures that only tenant-authorized automata can be created.

## Installation

```bash
bun add @automabase/automata-server
# or
npm install @automabase/automata-server
# or
yarn add @automabase/automata-server
```

## Usage

### Basic Example

```typescript
import { AutomataServerSDK } from '@automabase/automata-server';

// Initialize with tenant configuration
const sdk = new AutomataServerSDK({
  tenantId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  privateKey: process.env.TENANT_PRIVATE_KEY, // PEM format RSA private key
  defaultExpirationSeconds: 3600, // Optional, defaults to 1 hour
});

// Sign an automata descriptor
const descriptor = {
  name: 'OrderWorkflow',
  stateSchema: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      orderId: { type: 'string' },
    },
  },
  eventSchemas: {
    ORDER_CREATED: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
      },
    },
    ORDER_COMPLETED: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
      },
    },
  },
  initialState: { status: 'pending' },
  transition: 'state.merge(event.data)',
};

const signature = await sdk.signDescriptor(descriptor, 7200); // 2 hours expiration

// The signature can then be sent to clients to create automata
```

### Advanced Example

```typescript
import { AutomataServerSDK } from '@automabase/automata-server';

const sdk = new AutomataServerSDK({
  tenantId: process.env.TENANT_ID,
  privateKey: process.env.TENANT_PRIVATE_KEY,
});

// Create a descriptor template
function createOrderWorkflowDescriptor(orderId: string) {
  return {
    name: `OrderWorkflow-${orderId}`,
    stateSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'processing', 'completed'] },
        orderId: { type: 'string' },
        createdAt: { type: 'string' },
      },
      required: ['status', 'orderId', 'createdAt'],
    },
    eventSchemas: {
      ORDER_CREATED: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
          createdAt: { type: 'string' },
        },
        required: ['orderId', 'createdAt'],
      },
      ORDER_COMPLETED: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
          completedAt: { type: 'string' },
        },
        required: ['orderId', 'completedAt'],
      },
    },
    initialState: {
      status: 'pending',
      orderId,
      createdAt: new Date().toISOString(),
    },
    transition: `
      $merge([
        $state,
        event.type = "ORDER_CREATED" ? { status: "processing" } : {},
        event.type = "ORDER_COMPLETED" ? { status: "completed", completedAt: event.data.completedAt } : {}
      ])
    `,
  };
}

// Sign multiple descriptors
async function signOrderWorkflow(orderId: string) {
  const descriptor = createOrderWorkflowDescriptor(orderId);
  const signature = await sdk.signDescriptor(descriptor, 3600); // 1 hour expiration
  return { descriptor, signature };
}
```

## API Reference

### `AutomataServerSDK`

Main SDK class for signing automata descriptors.

#### Constructor

```typescript
new AutomataServerSDK(config: AutomataServerSDKConfig)
```

**Parameters:**
- `config.tenantId` (string, required): Tenant ID that will sign the descriptors
- `config.privateKey` (string, required): Private RSA key in PEM format or JWK format
- `config.defaultExpirationSeconds` (number, optional): Default expiration time in seconds (default: 3600 = 1 hour)

#### Methods

##### `signDescriptor(descriptor, expiresInSeconds?)`

Sign an automata descriptor.

**Parameters:**
- `descriptor` (AutomataDescriptor, required): The automata descriptor to sign
- `expiresInSeconds` (number, optional): Signature expiration time in seconds (uses default if not provided)

**Returns:** Promise<string> - JWT signature string

##### `computeDescriptorHash(descriptor)`

Compute SHA-256 hash of an automata descriptor.

**Parameters:**
- `descriptor` (AutomataDescriptor, required): The automata descriptor to hash

**Returns:** string - SHA-256 hash string

##### `getTenantId()`

Get the tenant ID configured for this SDK instance.

**Returns:** string - Tenant ID

## Security Notes

- **Private Key Management**: Never expose private keys to clients. This SDK should only be used on the server side.
- **Signature Expiration**: Set appropriate expiration times for signatures based on your use case.
- **Key Rotation**: When rotating keys, ensure that old signatures expire before the key rotation.

## License

MIT
