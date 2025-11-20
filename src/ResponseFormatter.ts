import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export class ResponseFormatter {
  static formatSuccess(data: unknown) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify(data, null, 2)
      }]
    };
  }

  static formatError(error: unknown) {
    if (error instanceof McpError) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: error.message
        }]
      };
    }

    return {
      isError: true,
      content: [{
        type: "text",
        text: error instanceof Error ? error.message : 'Unknown error occurred'
      }]
    };
  }

  static createMcpError(code: ErrorCode, message: string): McpError {
    return new McpError(code, message);
  }
} 