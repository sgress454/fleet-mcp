declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  export interface ResourceMetadata {
    description?: string;
    parameters?: Record<string, any>;
    [key: string]: any;
  }

  export interface RegisteredResource {
    name: string;
    metadata?: ResourceMetadata;
    enabled: boolean;
    disable: () => void;
    enable: () => void;
    remove: () => void;
    update: (updates: any) => void;
  }

  export type ReadResourceCallback = (uri: URL, params: Record<string, string>) => Promise<any>;

  export class McpServer {
    constructor(options: {
      name: string;
      version: string;
    }, config?: any);

    tool(
      name: string,
      description: string,
      inputSchema: any,
      handler: (args: any, context?: any) => Promise<any>
    ): void;

    resource(
      name: string,
      uri: string,
      metadata: ResourceMetadata,
      readCallback: ReadResourceCallback
    ): RegisteredResource;

    connect(transport: any): Promise<void>;
  }
}

declare module '@modelcontextprotocol/sdk/server/sse.js' {
  export class SSEServerTransport {
    constructor(messagesEndpoint: string, res: any);
    sessionId: string;
    onclose: () => void;
    close(): Promise<void>;
    handlePostMessage(req: any, res: any, body: any): Promise<void>;
  }
}