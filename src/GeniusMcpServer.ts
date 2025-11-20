#!/usr/bin/env node

import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JSONRPCMessage, Tool } from "@modelcontextprotocol/sdk/types.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { McpFunction } from "./McpFunction.js";
import { ApiKeyManager } from "./ApiKeyManager.js";
import 'dotenv/config';

export class GeniusMcpServer {
  private mcpFunctions: Array<McpFunction> = [];
  private server: McpServer;
  private app = express();
  private transports: {[sessionId: string]: SSEServerTransport} = {};
  private serverName = "Genius Mcp Server";
  private serverVersion = "0.1.0";
  private port = 3000; 

  constructor(name?: string, port?: number, functions?: Array<McpFunction>) {
    this.serverName = name || this.serverName;
    this.serverVersion = process.env.APP_VERSION || this.serverVersion;
    this.port = port || this.port;
    if (functions) {
      this.mcpFunctions = functions;
    }
    this.server = new McpServer(
      {
          name: this.serverName,
          version: this.serverVersion,
      }, 
      {
          capabilities: { tools: {} },
      }
    );
    this.installTools(this.server);
  }

  private getTools(): Array<Tool> {
    const tools: Array<Tool> = [];
    for (const func of this.mcpFunctions) {
      const name = func.name;
      const description = func.description;
      const inputSchema = func.inputschema;
      const tool: Tool = {
        name,
        description,
        inputSchema,
      }
      tools.push(tool);
    }
    return tools;
  }

  private installTools(server: McpServer): void {
    for (const func of this.mcpFunctions) {
      server.tool(func.name, func.description, func.zschema, func.handleExecution.bind(func));
    }
  }

  private pingFunction() {   
  }

  private installApp() {
    // Configure CORS middleware to allow all origins
    this.app.use(
      cors({
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"],
        credentials: false,
      })
    );

    // Add a simple root route handler
    this.app.get("/", (req, res) => {
      res.json({
        name: this.serverName,
        version: this.serverVersion,
        status: "running",
        endpoints: {
          "/": "Server information (this response)",
          "/sse": "Server-Sent Events endpoint for MCP connection",
          "/messages": "POST endpoint for MCP messages",
        },
        tools: this.getTools(),
      });
    });

    function hasMethod(obj: any, methodName: string) {
      return obj && typeof obj[methodName] === 'function';
    }

    this.app.get("/sse", async (req, res) => {
      let mount = "";
      if (req.headers.origin) {
        mount = req.headers.origin;
      }
      const transport = new SSEServerTransport(mount + '/messages', res);
      this.transports[transport.sessionId] = transport;
      res.on("close", () => {
        delete this.transports[transport.sessionId];
        if (hasMethod(transport, 'close')) {
          try {
            transport.close();
          } catch (closeError) {
            console.error(`Error closing transport for session ${transport.sessionId}:`, closeError);
          }
        }
      });
      await this.server.connect(transport);

      const pingInterval = setInterval(() => {
        // Check if the response is still writable and the transport is still in our lookup
        if (res.writableEnded || !this.transports[transport.sessionId]) {
          console.log(`Clearing ping interval for session: ${transport.sessionId} (connection closed)`);
          clearInterval(pingInterval);
          return;
        }
  
        try {
          // Check if the transport is still connected before sending
          // We can do this by checking if the transport is still in our lookup
          if (this.transports[transport.sessionId] && hasMethod(transport, 'send')) {
            // Additional check to see if the transport has a valid response
            // This is an internal implementation detail of SSEServerTransport
            // but we can check it safely with optional chaining
            const ping: JSONRPCMessage = {
              "jsonrpc": "2.0",
              "id": "123",
              "method": "ping"
            };
            transport.send(ping);
          } else {
            if (!res.writableEnded) {
              res.write(`:ping\n\n`);
            } else {
              console.log(`Response for session ${transport.sessionId} is no longer writable, clearing interval`);
              clearInterval(pingInterval);
            }
          }
        } catch (pingError) {
          console.error(`Error sending ping for session ${transport.sessionId}:`, pingError);
          clearInterval(pingInterval);
          // Clean up the transport from our lookup if we can't send to it
          delete this.transports[transport.sessionId];
        }
      }, 10000);
    });

    this.app.post("/messages", async (req, res) => {
      const headers = req.headers;
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        console.error('Message received without sessionId');
        res.status(400).json({ error: 'MCP Error: sessionId is required' });
        return;
      }
      await ApiKeyManager.getInstance().loadAuthData(req);
      const transport = this.transports[sessionId];
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).json({error: 'MCP Error: No transport found for sessionId'});
      }
    });
  }

  async run(): Promise<void> {
    this.installApp();
    this.app.listen(this.port, () => {
      console.log(this.serverName + " " + this.serverVersion + ` running on port ${this.port}`);
    });  
  }
}


  



