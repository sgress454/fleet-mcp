#!/usr/bin/env node
import { config } from 'dotenv';
import axios from 'axios';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

// Load environment variables
config();

// Fleet API configuration
const FLEET_SERVER_URL = process.env.FLEET_SERVER_URL || 'https://fleet.example.com/api';
const FLEET_API_KEY = process.env.FLEET_API_KEY;

// Server configuration
const PORT = parseInt(process.env.PORT || '3000', 10);

if (!FLEET_API_KEY) {
  console.error('FLEET_API_KEY environment variable is required');
  process.exit(1);
}

// MCP Server implementation
class FleetMcpServer {
  private app: express.Application;
  private httpServer;
  private mcpServer: McpServer;
  private axiosInstance;
  private transports: Record<string, SSEServerTransport> = {};
  
  constructor() {
    // Initialize Express app
    this.app = express();
    
    // Initialize axios instance with Fleet API configuration
    this.axiosInstance = axios.create({
      baseURL: FLEET_SERVER_URL,
      headers: {
        'Authorization': `Bearer ${FLEET_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    // Configure Express
    this.app.use(cors());
    this.app.use(express.json());
    
    // Create HTTP server
    this.httpServer = createServer(this.app);
    
    // Create MCP server
    this.mcpServer = new McpServer({
      name: 'fleet-api-server',
      version: '0.1.0',
    });
    
    // Set up MCP handlers
    this.setupMcpHandlers();
    
    // Set up routes
    this.setupRoutes();
    
    // Handle process termination
    process.on('SIGINT', async () => {
      console.log('Shutting down MCP server...');
      
      // Close all active transports
      for (const sessionId in this.transports) {
        try {
          console.log(`Closing transport for session ${sessionId}`);
          await this.transports[sessionId].close();
          delete this.transports[sessionId];
        } catch (error) {
          console.error(`Error closing transport for session ${sessionId}:`, error);
        }
      }
      
      this.httpServer.close();
      process.exit(0);
    });
  }
  
  /**
   * Set up Express routes
   */
  private setupRoutes(): void {
    // SSE endpoint for establishing the stream
    this.app.get('/mcp', async (req, res) => {
      console.log('Received GET request to /mcp (establishing SSE stream)');
      try {
        // Create a new SSE transport for the client
        const transport = new SSEServerTransport('/mcp/messages', res);
        
        // Store the transport by session ID
        const sessionId = transport.sessionId;
        this.transports[sessionId] = transport;
        
        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          console.log(`SSE transport closed for session ${sessionId}`);
          delete this.transports[sessionId];
        };
        
        // Connect the transport to the MCP server
        await this.mcpServer.connect(transport);
        console.log(`Established SSE stream with session ID: ${sessionId}`);
      } catch (error) {
        console.error('Error establishing SSE stream:', error);
        if (!res.headersSent) {
          res.status(500).send('Error establishing SSE stream');
        }
      }
    });
    
    // Messages endpoint for receiving client JSON-RPC requests
    this.app.post('/mcp/messages', async (req, res) => {
      console.log('Received POST request to /mcp/messages');
      
      // Extract session ID from URL query parameter
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        console.error('No session ID provided in request URL');
        res.status(400).send('Missing sessionId parameter');
        return;
      }
      
      const transport = this.transports[sessionId];
      if (!transport) {
        console.error(`No active transport found for session ID: ${sessionId}`);
        res.status(404).send('Session not found');
        return;
      }
      
      try {
        // Handle the POST message with the transport
        await transport.handlePostMessage(req, res, req.body);
      } catch (error) {
        console.error('Error handling request:', error);
        if (!res.headersSent) {
          res.status(500).send('Error handling request');
        }
      }
    });
  }
  
  /**
   * Set up MCP handlers
   */
  private setupMcpHandlers(): void {
    // Register the install_software tool
    this.mcpServer.tool(
      'install_software',
      'Install software on a host managed by Fleet',
      {
        host_id: z.string().describe('Required. The host ID'),
        software_id: z.string().describe('Required. The software title ID')
      },
      async (params: { host_id: string; software_id: string }) => {
        try {
          console.log(`Installing software ID ${params.software_id} on host ID ${params.host_id}`);
          
          const url = `/api/v1/fleet/hosts/${params.host_id}/software/${params.software_id}/install`;
          const response = await this.axiosInstance.post(url);
          console.log('Fleet API install request successful');
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
    );
    
    // Register the list_host_software tool
    this.mcpServer.tool(
      'list_host_software',
      'List software installed on a specific host managed by Fleet',
      {
        id: z.string().describe('Required. The host ID'),
        available_for_install: z.boolean().optional().describe('If true, only list software that is available for install (added by the user) and automatically sets installed_only to false. Default is false.'),
        installed_only: z.boolean().optional().describe('If true, only list software that is actually installed (has installed_versions or status="installed"). Default is true. Ignored if available_for_install is true.'),
        software_name: z.string().optional().describe('If provided, only list software that matches this name (case-insensitive partial match)')
      },
      async (params: { id: string; available_for_install?: boolean; installed_only?: boolean; software_name?: string }) => {
        try {
          console.log(`Making Fleet API call to get software for host ID: ${params.id}`);
          
          // Build the URL with query parameters if needed
          let url = `/api/v1/fleet/hosts/${params.id}/software?per_page=200`;
          if (params.available_for_install) {
            url += `&available_for_install=${params.available_for_install ? '1' : '0'}`;
          }
          
          const response = await this.axiosInstance.get(url);
          console.log('Fleet API call successful');
          
          let software = response.data.software || [];
          
          // If available_for_install is true, automatically set installed_only to false
          let effectiveInstalledOnly = params.installed_only !== false;
          if (params.available_for_install === true) {
            console.log('available_for_install is true, automatically setting installed_only to false');
            effectiveInstalledOnly = false;
          }
          
          // Filter software based on installed_only parameter (default to true if not provided)
          if (effectiveInstalledOnly) {
            console.log('Filtering for installed software only');
            const installedSoftware = software.filter((sw: any) =>
              sw.installed_versions !== null || sw.status === "installed"
            );
            console.log(`Found ${installedSoftware.length} installed software out of ${software.length} total`);
            software = installedSoftware;
          }
          
          // Filter software by name if provided
          if (params.software_name) {
            console.log(`Filtering for software matching name: ${params.software_name}`);
            const nameLower = params.software_name.toLowerCase();
            const matchingSoftware = software.filter((sw: any) =>
              sw.name.toLowerCase().includes(nameLower)
            );
            console.log(`Found ${matchingSoftware.length} software matching name "${params.software_name}"`);
            software = matchingSoftware;
          }
          
          // Update the response data with filtered software
          response.data.software = software;
          response.data.count = software.length;
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
    );
    
    // Register the list_hosts tool
    this.mcpServer.tool(
      'list_hosts',
      'List all hosts (devices) managed by Fleet',
      {
        platform: z.string().optional().describe('Filter by platform (e.g., darwin, windows, ubuntu, ios, android)'),
        status: z.string().optional().describe('Filter by status (online, offline)'),
        team_id: z.string().optional().describe('Filter by team ID'),
        email: z.string().optional().describe('Filter by user email'),
        limit: z.string().optional().describe('Maximum number of results to return')
      },
      async (params: {
        platform?: string;
        status?: string;
        team_id?: string;
        email?: string;
        limit?: string;
      }) => {
        console.log('Tool handler called with params:', params);
        console.log('Platform parameter:', params.platform);
        
        try {
          console.log('Making Fleet API call to get hosts...');
          const response = await this.axiosInstance.get('/api/v1/fleet/hosts?device_mapping=true');
          console.log('Fleet API call successful');
          
          // Get the hosts from the response
          let hosts = response.data.hosts || [];
          
          // Apply platform filter if provided
          if (params.platform) {
            console.log(`Filtering by platform: ${params.platform}`);
            hosts = hosts.filter((host: any) => host.platform === params.platform);
            console.log(`Found ${hosts.length} hosts with platform ${params.platform}`);
          }
          
          // Apply status filter if provided
          if (params.status) {
            console.log(`Filtering by status: ${params.status}`);
            hosts = hosts.filter((host: any) => host.status === params.status);
            console.log(`Found ${hosts.length} hosts with status ${params.status}`);
          }
          
          // Apply team_id filter if provided
          if (params.team_id) {
            console.log(`Filtering by team_id: ${params.team_id}`);
            hosts = hosts.filter((host: any) => host.team_id === parseInt(params.team_id!, 10));
            console.log(`Found ${hosts.length} hosts with team_id ${params.team_id}`);
          }
          
          // Apply email filter if provided
          if (params.email) {
            console.log(`Filtering by email: ${params.email}`);
            hosts = hosts.filter((host: any) => {
              // Check if the host has device_mapping with an email that matches
              if (host.device_mapping && Array.isArray(host.device_mapping)) {
                return host.device_mapping.some((mapping: any) =>
                  mapping.email && mapping.email.toLowerCase() === params.email!.toLowerCase()
                );
              }
              return false;
            });
            console.log(`Found ${hosts.length} hosts with email ${params.email}`);
          }
          
          // Apply limit if provided
          if (params.limit) {
            const limit = parseInt(params.limit, 10);
            if (!isNaN(limit) && limit > 0 && limit < hosts.length) {
              console.log(`Limiting results to ${limit} hosts`);
              hosts = hosts.slice(0, limit);
            }
          }
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(hosts, null, 2),
              },
            ],
          };
        } catch (error) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
    );
    
    // Register the get_host tool
    this.mcpServer.tool(
      'get_host',
      'Get detailed information about a specific host managed by Fleet',
      {
        id: z.string().describe('Required. The host ID'),
        exclude_software: z.boolean().optional().describe('If true, the response will not include a list of installed software for the host')
      },
      async (params: {
        id: string;
        exclude_software?: boolean;
      }) => {
        console.log('get_host called with params:', params);
        
        try {
          // Build the query string
          const queryParams = new URLSearchParams();
          if (params.exclude_software) {
            queryParams.append('exclude_software', 'true');
          }
          
          const url = `/api/v1/fleet/hosts/${params.id}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          console.log('Making Fleet API call to:', url);
          
          const response = await this.axiosInstance.get(url);
          console.log('Fleet API call successful');
          
          const host = response.data.host;
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(host, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          
          // Handle specific error cases
          if (error.response?.status === 404) {
            throw {
              code: 'not_found',
              message: `Host with ID ${params.id} not found`,
            };
          }
          
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_fleet_version tool
    this.mcpServer.tool(
      'get_fleet_version',
      'Get the version of the Fleet server',
      {},
      async () => {
        try {
          const response = await this.axiosInstance.get('/api/v1/fleet/version');
          
          const version = response.data;
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(version, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_teams tool
    this.mcpServer.tool(
      'list_teams',
      'List all teams in Fleet',
      {
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        order_direction: z.string().optional().describe('Order direction (asc or desc)'),
        query: z.string().optional().describe('Search query to filter teams')
      },
      async (params: {
        page?: number;
        per_page?: number;
        order_key?: string;
        order_direction?: string;
        query?: string;
      }) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.page !== undefined) queryParams.append('page', params.page.toString());
          if (params.per_page !== undefined) queryParams.append('per_page', params.per_page.toString());
          if (params.order_key) queryParams.append('order_key', params.order_key);
          if (params.order_direction) queryParams.append('order_direction', params.order_direction);
          if (params.query) queryParams.append('query', params.query);
          
          const url = `/api/v1/fleet/teams${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          const teams = response.data.teams || [];
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(teams, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_team_details tool
    this.mcpServer.tool(
      'get_team_details',
      'Get detailed information about a specific team',
      {
        id: z.string().describe('Required. The team ID')
      },
      async (params: { id: string }) => {
        try {
          const response = await this.axiosInstance.get(`/api/v1/fleet/teams/${params.id}`);
          const team = response.data.team;
          
          return {
            content: [
              {
                type: 'text',
                text: `\nRaw JSON response:\n${JSON.stringify(team, null, 2)}`,
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          
          if (error.response?.status === 404) {
            throw {
              code: 'not_found',
              message: `Team with ID ${params.id} not found`,
            };
          }
          
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_global_policies tool
    this.mcpServer.tool(
      'list_global_policies',
      'List all global policies in Fleet',
      {},
      async () => {
        try {
          const response = await this.axiosInstance.get('/api/v1/fleet/global/policies');
          const policies = response.data.policies || [];
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(policies, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_team_policies tool
    this.mcpServer.tool(
      'list_team_policies',
      'List policies for a specific team',
      {
        id: z.string().describe('Required. The team ID'),
        merge_inherited: z.boolean().optional().describe('If true, includes global policies inherited by the team')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.merge_inherited !== undefined) {
            queryParams.append('merge_inherited', params.merge_inherited.toString());
          }
          
          const url = `/api/v1/fleet/teams/${params.id}/policies${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          
          if (error.response?.status === 404) {
            throw {
              code: 'not_found',
              message: `Team with ID ${params.id} not found`,
            };
          }
          
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_queries tool
    this.mcpServer.tool(
      'list_queries',
      'List all queries in Fleet',
      {
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        order_direction: z.string().optional().describe('Order direction (asc or desc)'),
        query: z.string().optional().describe('Search query to filter queries')
      },
      async (params: {
        page?: number;
        per_page?: number;
        order_key?: string;
        order_direction?: string;
        query?: string;
      }) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.page !== undefined) queryParams.append('page', params.page.toString());
          if (params.per_page !== undefined) queryParams.append('per_page', params.per_page.toString());
          if (params.order_key) queryParams.append('order_key', params.order_key);
          if (params.order_direction) queryParams.append('order_direction', params.order_direction);
          if (params.query) queryParams.append('query', params.query);
          
          const url = `/api/v1/fleet/queries${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          const queries = response.data.queries || [];
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(queries, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_software_titles tool
    this.mcpServer.tool(
      'list_software_titles',
      'List software titles in Fleet',
      {
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        order_direction: z.string().optional().describe('Order direction (asc or desc)'),
        query: z.string().optional().describe('Search query to filter software'),
        team_id: z.string().optional().describe('Filter by team ID'),
        platform: z.string().optional().describe('Filter by platform (darwin, windows, linux)'),
        available_for_install: z.boolean().optional().describe('Filter software available for install. If true, team_id must be set.')
      },
      async (params: {
        page?: number;
        per_page?: number;
        order_key?: string;
        order_direction?: string;
        query?: string;
        team_id?: string;
        platform?: string;
        available_for_install?: boolean;
      }) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.page !== undefined) queryParams.append('page', params.page.toString());
          if (params.per_page !== undefined) queryParams.append('per_page', params.per_page.toString());
          if (params.order_key) queryParams.append('order_key', params.order_key);
          if (params.order_direction) queryParams.append('order_direction', params.order_direction);
          if (params.query) queryParams.append('query', params.query);
          if (params.team_id) queryParams.append('team_id', params.team_id);
          if (params.platform) queryParams.append('platform', params.platform);
          if (params.available_for_install !== undefined) queryParams.append('available_for_install', params.available_for_install.toString());
          
          const url = `/api/v1/fleet/software/titles${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          const software = response.data.software_titles || [];
          const count = response.data.count || software.length;
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(software, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_users tool
    this.mcpServer.tool(
      'list_users',
      'List all users in Fleet',
      {
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        order_direction: z.string().optional().describe('Order direction (asc or desc)'),
        query: z.string().optional().describe('Search query to filter users'),
        team_id: z.string().optional().describe('Filter by team ID')
      },
      async (params: {
        page?: number;
        per_page?: number;
        order_key?: string;
        order_direction?: string;
        query?: string;
        team_id?: string;
      }) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.page !== undefined) queryParams.append('page', params.page.toString());
          if (params.per_page !== undefined) queryParams.append('per_page', params.per_page.toString());
          if (params.order_key) queryParams.append('order_key', params.order_key);
          if (params.order_direction) queryParams.append('order_direction', params.order_direction);
          if (params.query) queryParams.append('query', params.query);
          if (params.team_id) queryParams.append('team_id', params.team_id);
          
          const url = `/api/v1/fleet/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          const users = response.data.users || [];
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(users, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_hosts_count tool
    this.mcpServer.tool(
      'get_hosts_count',
      'Get count of hosts in Fleet. To filter by platform, use the builtin label_id corresponding to the platform you want. Get the label_id using list_labels tool.',
      {
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        query: z.string().optional().describe('Search query to filter hosts'),
        status: z.string().optional().describe('Filter by status (online, offline, new, mia)'),
        team_id: z.string().optional().describe('Filter by team ID'),
        policy_id: z.string().optional().describe('Filter by policy ID'),
        policy_response: z.string().optional().describe('Filter by policy response (passing, failing)'),
        software_id: z.string().optional().describe('Filter by software ID'),
        os_id: z.string().optional().describe('Filter by operating system ID'),
        os_name: z.string().optional().describe('Filter by operating system name'),
        os_version: z.string().optional().describe('Filter by operating system version'),
        label_id: z.string().optional().describe('Filter by label ID.'),
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          Object.keys(params).forEach(key => {
            if (params[key] !== undefined) {
              queryParams.append(key, params[key].toString());
            }
          });
          
          const url = `/api/v1/fleet/hosts/count${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_host_summary tool
    this.mcpServer.tool(
      'get_host_summary',
      'Get host summary statistics',
      {
        team_id: z.string().optional().describe('Filter by team ID'),
        platform: z.string().optional().describe('Filter by platform'),
        low_disk_space: z.number().optional().describe('Gigabytes (GB) to filter by low disk space')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.team_id) queryParams.append('team_id', params.team_id);
          if (params.platform) queryParams.append('platform', params.platform);
          if (params.low_disk_space !== undefined) queryParams.append('low_disk_space', params.low_disk_space.toString());
          
          const url = `/api/v1/fleet/host_summary${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_mdm_summary tool
    this.mcpServer.tool(
      'get_mdm_summary',
      'Get MDM enrollment summary statistics',
      {
        team_id: z.string().optional().describe('Filter by team ID'),
        platform: z.string().optional().describe('Filter by platform (darwin, windows)')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.team_id) queryParams.append('team_id', params.team_id);
          if (params.platform) queryParams.append('platform', params.platform);
          
          const url = `/api/v1/fleet/hosts/summary/mdm${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_activities tool
    this.mcpServer.tool(
      'list_activities',
      'List activities in Fleet',
      {
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        order_direction: z.string().optional().describe('Order direction (asc or desc)'),
        query: z.string().optional().describe('Search query to filter activities')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.page !== undefined) queryParams.append('page', params.page.toString());
          if (params.per_page !== undefined) queryParams.append('per_page', params.per_page.toString());
          if (params.order_key) queryParams.append('order_key', params.order_key);
          if (params.order_direction) queryParams.append('order_direction', params.order_direction);
          if (params.query) queryParams.append('query', params.query);
          
          const url = `/api/v1/fleet/activities${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_fleet_config tool
    this.mcpServer.tool(
      'get_fleet_config',
      'Get Fleet configuration',
      {},
      async () => {
        try {
          const response = await this.axiosInstance.get('/api/v1/fleet/config');
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_enroll_secrets tool
    this.mcpServer.tool(
      'get_enroll_secrets',
      'Get global enroll secrets',
      {},
      async () => {
        try {
          const response = await this.axiosInstance.get('/api/v1/fleet/spec/enroll_secret');
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_configuration_profiles tool
    this.mcpServer.tool(
      'list_configuration_profiles',
      'List configuration profiles',
      {
        team_id: z.string().optional().describe('Filter by team ID')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.team_id) queryParams.append('team_id', params.team_id);
          
          const url = `/api/v1/fleet/configuration_profiles${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_configuration_profile tool
    this.mcpServer.tool(
      'get_configuration_profile',
      'Get a specific configuration profile',
      {
        profile_uuid: z.string().describe('Required. The profile UUID'),
        alt: z.string().optional().describe('Set to "media" to download the profile file')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.alt) queryParams.append('alt', params.alt);
          
          const url = `/api/v1/fleet/configuration_profiles/${params.profile_uuid}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: params.alt === 'media' ? response.data : JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          
          if (error.response?.status === 404) {
            throw {
              code: 'not_found',
              message: `Configuration profile with UUID ${params.profile_uuid} not found`,
            };
          }
          
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_configuration_profiles_summary tool
    this.mcpServer.tool(
      'get_configuration_profiles_summary',
      'Get configuration profiles summary statistics',
      {
        team_id: z.string().optional().describe('Filter by team ID')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.team_id) queryParams.append('team_id', params.team_id);
          
          const url = `/api/v1/fleet/configuration_profiles/summary${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_os_versions tool
    this.mcpServer.tool(
      'list_os_versions',
      'List operating system versions',
      {
        team_id: z.string().optional().describe('Filter by team ID'),
        platform: z.string().optional().describe('Filter by platform'),
        os_name: z.string().optional().describe('Filter by OS name'),
        os_version: z.string().optional().describe('Filter by OS version'),
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        order_direction: z.string().optional().describe('Order direction (asc or desc)')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          Object.keys(params).forEach(key => {
            if (params[key] !== undefined) {
              queryParams.append(key, params[key].toString());
            }
          });
          
          const url = `/api/v1/fleet/os_versions${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_os_version tool
    this.mcpServer.tool(
      'get_os_version',
      'Get details for a specific OS version',
      {
        id: z.string().describe('Required. The OS version ID'),
        team_id: z.string().optional().describe('Filter by team ID')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.team_id) queryParams.append('team_id', params.team_id);
          
          const url = `/api/v1/fleet/os_versions/${params.id}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          
          if (error.response?.status === 404) {
            throw {
              code: 'not_found',
              message: `OS version with ID ${params.id} not found`,
            };
          }
          
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_vulnerabilities tool
    this.mcpServer.tool(
      'list_vulnerabilities',
      'List vulnerabilities',
      {
        team_id: z.string().optional().describe('Filter by team ID'),
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        order_direction: z.string().optional().describe('Order direction (asc or desc)'),
        query: z.string().optional().describe('Search query to filter vulnerabilities'),
        exploit: z.boolean().optional().describe('Filter by known exploits')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          Object.keys(params).forEach(key => {
            if (params[key] !== undefined) {
              queryParams.append(key, params[key].toString());
            }
          });
          
          const url = `/api/v1/fleet/vulnerabilities${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_vulnerability tool
    this.mcpServer.tool(
      'get_vulnerability',
      'Get details for a specific vulnerability',
      {
        cve: z.string().describe('Required. The CVE identifier (e.g., cve-2022-30190)'),
        team_id: z.string().optional().describe('Filter by team ID')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.team_id) queryParams.append('team_id', params.team_id);
          
          const url = `/api/v1/fleet/vulnerabilities/${params.cve}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          
          if (error.response?.status === 404) {
            throw {
              code: 'not_found',
              message: `Vulnerability ${params.cve} not found`,
            };
          }
          
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_labels tool
    this.mcpServer.tool(
      'list_labels',
      'List all labels in Fleet',
      {
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        order_direction: z.string().optional().describe('Order direction (asc or desc)')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.page !== undefined) queryParams.append('page', params.page.toString());
          if (params.per_page !== undefined) queryParams.append('per_page', params.per_page.toString());
          if (params.order_key) queryParams.append('order_key', params.order_key);
          if (params.order_direction) queryParams.append('order_direction', params.order_direction);
          
          const url = `/api/v1/fleet/labels${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_label tool
    this.mcpServer.tool(
      'get_label',
      'Get details for a specific label',
      {
        id: z.string().describe('Required. The label ID')
      },
      async (params: any) => {
        try {
          const response = await this.axiosInstance.get(`/api/v1/fleet/labels/${params.id}`);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          
          if (error.response?.status === 404) {
            throw {
              code: 'not_found',
              message: `Label with ID ${params.id} not found`,
            };
          }
          
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_labels_summary tool
    this.mcpServer.tool(
      'get_labels_summary',
      'Get labels summary statistics',
      {},
      async () => {
        try {
          const response = await this.axiosInstance.get('/api/v1/fleet/labels/summary');
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_label_hosts tool
    this.mcpServer.tool(
      'get_label_hosts',
      'Get hosts that match a specific label',
      {
        id: z.string().describe('Required. The label ID'),
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        order_direction: z.string().optional().describe('Order direction (asc or desc)'),
        query: z.string().optional().describe('Search query to filter hosts'),
        status: z.string().optional().describe('Filter by status (online, offline, new, mia)'),
        team_id: z.string().optional().describe('Filter by team ID')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          Object.keys(params).forEach(key => {
            if (key !== 'id' && params[key] !== undefined) {
              queryParams.append(key, params[key].toString());
            }
          });
          
          const url = `/api/v1/fleet/labels/${params.id}/hosts${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_scripts tool
    this.mcpServer.tool(
      'list_scripts',
      'List all scripts in Fleet',
      {
        team_id: z.string().optional().describe('Filter by team ID'),
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.team_id) queryParams.append('team_id', params.team_id);
          if (params.page !== undefined) queryParams.append('page', params.page.toString());
          if (params.per_page !== undefined) queryParams.append('per_page', params.per_page.toString());
          
          const url = `/api/v1/fleet/scripts${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_script tool
    this.mcpServer.tool(
      'get_script',
      'Get details for a specific script',
      {
        id: z.string().describe('Required. The script ID'),
        alt: z.string().optional().describe('Set to "media" to download the script file'),
        team_id: z.string().optional().describe('Team ID (required for team scripts)')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.alt) queryParams.append('alt', params.alt);
          if (params.team_id) queryParams.append('team_id', params.team_id);
          
          const url = `/api/v1/fleet/scripts/${params.id}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: params.alt === 'media' ? response.data : JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          
          if (error.response?.status === 404) {
            throw {
              code: 'not_found',
              message: `Script with ID ${params.id} not found`,
            };
          }
          
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_script_results tool
    this.mcpServer.tool(
      'get_script_results',
      'Get results for a script execution',
      {
        execution_id: z.string().describe('Required. The script execution ID')
      },
      async (params: any) => {
        try {
          const response = await this.axiosInstance.get(`/api/v1/fleet/scripts/results/${params.execution_id}`);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          
          if (error.response?.status === 404) {
            throw {
              code: 'not_found',
              message: `Script execution with ID ${params.execution_id} not found`,
            };
          }
          
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_software_versions tool
    this.mcpServer.tool(
      'list_software_versions',
      'List software versions',
      {
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        order_direction: z.string().optional().describe('Order direction (asc or desc)'),
        query: z.string().optional().describe('Search query to filter software'),
        team_id: z.string().optional().describe('Filter by team ID'),
        vulnerable: z.boolean().optional().describe('Filter by vulnerable software')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          Object.keys(params).forEach(key => {
            if (params[key] !== undefined) {
              queryParams.append(key, params[key].toString());
            }
          });
          
          const url = `/api/v1/fleet/software/versions${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_software_version tool
    this.mcpServer.tool(
      'get_software_version',
      'Get details for a specific software version',
      {
        id: z.string().describe('Required. The software version ID'),
        team_id: z.string().optional().describe('Filter by team ID')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.team_id) queryParams.append('team_id', params.team_id);
          
          const url = `/api/v1/fleet/software/versions/${params.id}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          
          if (error.response?.status === 404) {
            throw {
              code: 'not_found',
              message: `Software version with ID ${params.id} not found`,
            };
          }
          
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_app_store_apps tool
    this.mcpServer.tool(
      'list_app_store_apps',
      'List available App Store apps',
      {
        team_id: z.string().optional().describe('Filter by team ID'),
        platform: z.string().optional().describe('Filter by platform')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.team_id) queryParams.append('team_id', params.team_id);
          if (params.platform) queryParams.append('platform', params.platform);
          
          const url = `/api/v1/fleet/software/app_store_apps${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_fleet_maintained_apps tool
    this.mcpServer.tool(
      'list_fleet_maintained_apps',
      'List Fleet-maintained apps',
      {
        team_id: z.string().optional().describe('Filter by team ID'),
        platform: z.string().optional().describe('Filter by platform'),
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        order_direction: z.string().optional().describe('Order direction (asc or desc)'),
        query: z.string().optional().describe('Search query to filter apps')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          Object.keys(params).forEach(key => {
            if (params[key] !== undefined) {
              queryParams.append(key, params[key].toString());
            }
          });
          
          const url = `/api/v1/fleet/software/fleet_maintained_apps${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_fleet_maintained_app tool
    this.mcpServer.tool(
      'get_fleet_maintained_app',
      'Get details for a specific Fleet-maintained app',
      {
        id: z.string().describe('Required. The Fleet-maintained app ID')
      },
      async (params: any) => {
        try {
          const response = await this.axiosInstance.get(`/api/v1/fleet/software/fleet_maintained_apps/${params.id}`);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          
          if (error.response?.status === 404) {
            throw {
              code: 'not_found',
              message: `Fleet-maintained app with ID ${params.id} not found`,
            };
          }
          
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the list_invites tool
    this.mcpServer.tool(
      'list_invites',
      'List all invites in Fleet',
      {
        page: z.number().optional().describe('Page number for pagination (0-indexed)'),
        per_page: z.number().optional().describe('Number of results per page'),
        order_key: z.string().optional().describe('Field to order results by'),
        order_direction: z.string().optional().describe('Order direction (asc or desc)'),
        query: z.string().optional().describe('Search query to filter invites')
      },
      async (params: any) => {
        try {
          const queryParams = new URLSearchParams();
          if (params.page !== undefined) queryParams.append('page', params.page.toString());
          if (params.per_page !== undefined) queryParams.append('per_page', params.per_page.toString());
          if (params.order_key) queryParams.append('order_key', params.order_key);
          if (params.order_direction) queryParams.append('order_direction', params.order_direction);
          if (params.query) queryParams.append('query', params.query);
          
          const url = `/api/v1/fleet/invites${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
          const response = await this.axiosInstance.get(url);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
    
    // Register the get_invite tool
    this.mcpServer.tool(
      'get_invite',
      'Get details for a specific invite',
      {
        token: z.string().describe('Required. The invite token')
      },
      async (params: any) => {
        try {
          const response = await this.axiosInstance.get(`/api/v1/fleet/invites/${params.token}`);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Fleet API error:', error);
          
          if (error.response?.status === 404) {
            throw {
              code: 'not_found',
              message: `Invite with token ${params.token} not found`,
            };
          }
          
          throw {
            code: 'internal_error',
            message: `Fleet API error: ${error.response?.data?.message || error.message || String(error)}`,
          };
        }
      }
    );
  }
  
  /**
   * Start the MCP server
   */
  async start(port: number = 3000): Promise<void> {
    return new Promise<void>((resolve) => {
      this.httpServer.listen(port, () => {
        console.log(`Fleet MCP server running on http://localhost:${port}/mcp`);
        resolve();
      });
    });
  }
}

// Create and start the server
const server = new FleetMcpServer();
server.start(PORT).catch(console.error);