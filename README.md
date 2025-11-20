# @geniusagents/mcp

Core MCP (Model Context Protocol) server components for creating an MCP server for the Genius Dashboard. This package provides a reusable server implementation to easily create and deploy MCP servers.

## Installation

```bash
npm install @geniusagents/mcp
```

## Usage

### 1. Define your MCP Functions

Create classes that implement the `McpFunction` interface. Each function represents a tool that can be called by the MCP client.

```typescript
import { McpFunction } from '@geniusagents/mcp';
import { z } from 'zod';

export class AddMcp implements McpFunction {
  name = 'add';
  description = 'Adds two numbers';
  
  // Zod schema for validation and type inference
  zschema = {
    a: z.number().describe('The first number'),
    b: z.number().describe('The second number')
  };

  // JSON Schema for the MCP protocol (can be derived from zod or defined manually)
  inputschema = {
    type: "object",
    properties: {
      a: { type: "number", description: "The first number" },
      b: { type: "number", description: "The second number" }
    },
    required: ["a", "b"]
  };

  async handleExecution(args: any) {
    const { a, b } = args;
    return {
      content: [
        {
          type: "text",
          text: `The sum is ${a + b}`
        }
      ]
    };
  }
}
```

### 2. Create and Run the Server

Instantiate the `GeniusMcpServer` with your functions and start it.

```typescript
import { GeniusMcpServer, ApiKeyManager } from '@geniusagents/mcp';
import { AddMcp } from './AddMcp'; // Assuming AddMcp is in the same directory

// Initialize the ApiKeyManager with the MCP Name for the Genius Dashboard
ApiKeyManager.initialize({
    mcpName: "AddMcpServer",
    dashboardUrl: process.env.DASHBOARD_URL || "https://dashboard.geniusagents.nl/api/mcp"
});

// Initialize the GeniusMcpServer
const server = new GeniusMcpServer(
  'Add MCP Server',       // Server name
  3000,                   // Port
  [new AddMcp()]          // List of functions
);

server.run().catch(console.error);
```

## Features

- **Easy Setup**: Quickly spin up an MCP server with minimal boilerplate.
- **SSE Support**: Built-in Server-Sent Events transport for real-time communication.
- **Express Integration**: Built on top of Express.js.
- **Type Safety**: Written in TypeScript with full type definitions.

## License

ISC
