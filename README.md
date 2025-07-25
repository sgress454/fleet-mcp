# Fleet MCP Server

An MCP (Model Context Protocol) server for interacting with Fleet API. This server provides tools and resources for managing devices, policies, and queries through Fleet's API.

## Overview

This MCP server implements the Model Context Protocol to provide AI assistants with the ability to interact with Fleet's device management platform. It exposes a set of tools and resources that can be used to:

- Query and manage devices
- View device software inventory
- Install software on managed devices
- Filter devices by platform, status, team, and user email
- View and update policies
- Run Fleet queries
- Access device and policy information

## Prerequisites

- Node.js 18.x or higher
- npm 8.x or higher
- Access to a Fleet instance with API credentials

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/fleet-mcp.git
   cd fleet-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your Fleet API credentials using the interactive script:
   ```bash
   npm run update-credentials
   ```
   
   Alternatively, you can manually create a `.env` file based on the example:
   ```bash
   cp .env.example .env
   ```
   And edit it to add your Fleet API credentials:
   ```
   FLEET_SERVER_URL=https://your-fleet-instance.com/api
   FLEET_API_KEY=your_api_key_here
   ```

5. Test your Fleet API connection:
   ```bash
   npm run test-fleet-api
   ```

6. Build the TypeScript code:
   ```bash
   npm run build
   ```

7. Install the MCP server to your Cline configuration:
   ```bash
   npm run install-mcp
   ```
   This script will automatically add the Fleet MCP server to your Cline and/or Claude Desktop configuration.

8. Install the MCP server as a service:
   ```bash
   ./install-service.sh
   ```

## Usage

### Starting the Server

Start the MCP server using one of these methods:

```bash
# Using npm
npm start

# Using the shell script
./start-server.sh
```

The server will run on http://localhost:3000/mcp by default. You can change the port by setting the `PORT` environment variable in your `.env` file:

```
PORT=8080
```

Or by setting it when starting the server:

```bash
PORT=8080 npm start
```

### Configuring with Cline

You can automatically configure Cline to use this MCP server by running:

```bash
npm run install-mcp
```

This script will add the Fleet MCP server configuration to your Cline and/or Claude Desktop settings.

Alternatively, you can manually add the following configuration to your MCP settings file:

```json
{
  "mcpServers": {
    "fleet": {
      "url": "http://localhost:3000/mcp",
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

The settings files are located at:
- VS Code: `/Users/username/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`
- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`

### Testing with Cline

After setting up the server and installing it to your Cline configuration, you can test if everything is working correctly:

```bash
npm run test-with-cline
```

This script will:
1. Check if the Fleet MCP server is running
2. Verify that it's properly configured in Cline
3. Provide instructions for testing with Cline

### Available Tools

The server provides the following tools:

1. `list_hosts` - List all hosts (devices) managed by Fleet
   - Parameters:
     - `page` (optional): Page number of the results to fetch
     - `per_page` (optional): Results per page
     - `order_key` (optional): What to order results by (id, detail_updated_at, hostname, platform, osquery_version, os_version, uptime, memory, computer_name, last_enrolled_at, team_id, policy_updated_at)
     - `order_direction` (optional): The direction of the order (asc, desc). Default is "asc"
     - `status` (optional): Filter by status (new, online, offline, mia, missing)
     - `query` (optional): Search query for hostname, hardware_serial, uuid, ipv4, and email addresses
     - `team_id` (optional): Filter by team ID. Use "0" for hosts assigned to "No team"

2. `list_hosts_by_label_or_platform` - List hosts by label ID or platform
   - Parameters:
     - `id` (required): The label's ID (use list_labels tool to find platform label IDs)
     - `page` (optional): Page number of the results to fetch
     - `per_page` (optional): Results per page
     - `order_key` (optional): What to order results by (same options as list_hosts)
     - `order_direction` (optional): The direction of the order (asc, desc)
     - `status` (optional): Filter by status (new, online, offline, mia, missing)
     - `query` (optional): Search query for hostname, hardware_serial, uuid, and ipv4
     - `team_id` (optional): Filter by team ID. Use "0" for hosts assigned to "No team"

3. `list_host_software` - List software installed on a specific host managed by Fleet
   - Parameters:
     - `id` (required): The host ID
     - `available_for_install` (optional): If true, only list software that is available for install and automatically sets installed_only to false. Default is false.
     - `installed_only` (optional): If true, only list software that is actually installed (has installed_versions or status="installed"). Default is true. Ignored if available_for_install is true.
     - `software_name` (optional): If provided, only list software that matches this name (case-insensitive partial match)

3. `install_software` - Install software on a host managed by Fleet
   - Parameters:
     - `host_id` (required): The host ID
     - `software_id` (required): The software title ID

4. `get_host_details` - Get detailed information about a specific host managed by Fleet
   - Parameters:
     - `id` (required): The host ID
     - `exclude_software` (optional): If true, the response will not include a list of installed software for the host. Default is false.
   - Returns comprehensive host information including:
     - Basic information (name, platform, OS version, status)
     - Hardware details (model, serial, CPU, memory)
     - Network information (IP, MAC address)
     - Assigned users and team
     - Installed software (unless excluded)
     - MDM enrollment status
     - Policy compliance status

5. `get_fleet_version` - Get the version of the Fleet server
   - No parameters required
   - Returns version information including version number, branch, revision, Go version, build date, and build user

6. `list_teams` - List all teams in Fleet
   - Parameters:
     - `page` (optional): Page number for pagination (0-indexed)
     - `per_page` (optional): Number of results per page
     - `order_key` (optional): Field to order results by
     - `order_direction` (optional): Order direction (asc or desc)
     - `query` (optional): Search query to filter teams

7. `get_team_details` - Get detailed information about a specific team
   - Parameters:
     - `id` (required): The team ID
   - Returns comprehensive team information including webhook settings and MDM configuration

8. `list_global_policies` - List all global policies in Fleet
   - No parameters required
   - Returns all global policies with their query, description, resolution, platform, and compliance statistics

9. `list_team_policies` - List policies for a specific team
   - Parameters:
     - `id` (required): The team ID
     - `merge_inherited` (optional): If true, includes global policies inherited by the team

10. `list_queries` - List all queries in Fleet
   - Parameters:
     - `page` (optional): Page number for pagination (0-indexed)
     - `per_page` (optional): Number of results per page
     - `order_key` (optional): Field to order results by
     - `order_direction` (optional): Order direction (asc or desc)
     - `query` (optional): Search query to filter queries

11. `list_software_titles` - List software titles in Fleet
    - Parameters:
      - `page` (optional): Page number for pagination (0-indexed)
      - `per_page` (optional): Number of results per page
      - `order_key` (optional): Field to order results by
      - `order_direction` (optional): Order direction (asc or desc)
      - `query` (optional): Search query to filter software
      - `team_id` (optional): Filter by team ID
      - `platform` (optional): Filter by platform (darwin, windows, linux)
      - `available_for_install` (optional): Filter software available for install

12. `list_users` - List all users in Fleet
    - Parameters:
      - `page` (optional): Page number for pagination (0-indexed)
      - `per_page` (optional): Number of results per page
      - `order_key` (optional): Field to order results by
      - `order_direction` (optional): Order direction (asc or desc)
      - `query` (optional): Search query to filter users
      - `team_id` (optional): Filter by team ID

13. `get_hosts_count` - Get count of hosts in Fleet
    - Parameters: Multiple optional filters including page, per_page, query, status, team_id, policy_id, platform, etc.

14. `get_host_summary` - Get host summary statistics
    - Parameters:
      - `team_id` (optional): Filter by team ID
      - `platform` (optional): Filter by platform
      - `low_disk_space` (optional): Gigabytes (GB) to filter by low disk space

15. `get_mdm_summary` - Get MDM enrollment summary statistics
    - Parameters:
      - `team_id` (optional): Filter by team ID
      - `platform` (optional): Filter by platform (darwin, windows)

16. `list_activities` - List activities in Fleet
    - Parameters: page, per_page, order_key, order_direction, query (all optional)

17. `get_fleet_config` - Get Fleet configuration
    - No parameters required

18. `get_enroll_secrets` - Get global enroll secrets
    - No parameters required

19. `list_configuration_profiles` - List configuration profiles
    - Parameters:
      - `team_id` (optional): Filter by team ID

20. `get_configuration_profile` - Get a specific configuration profile
    - Parameters:
      - `profile_uuid` (required): The profile UUID
      - `alt` (optional): Set to "media" to download the profile file

21. `get_configuration_profiles_summary` - Get configuration profiles summary statistics
    - Parameters:
      - `team_id` (optional): Filter by team ID

22. `list_os_versions` - List operating system versions
    - Parameters: team_id, platform, os_name, os_version, page, per_page, order_key, order_direction (all optional)

23. `get_os_version` - Get details for a specific OS version
    - Parameters:
      - `id` (required): The OS version ID
      - `team_id` (optional): Filter by team ID

24. `list_vulnerabilities` - List vulnerabilities
    - Parameters: team_id, page, per_page, order_key, order_direction, query, exploit (all optional)

25. `get_vulnerability` - Get details for a specific vulnerability
    - Parameters:
      - `cve` (required): The CVE identifier (e.g., cve-2022-30190)
      - `team_id` (optional): Filter by team ID

26. `list_labels` - List all labels in Fleet
    - Parameters: page, per_page, order_key, order_direction (all optional)

27. `get_label` - Get details for a specific label
    - Parameters:
      - `id` (required): The label ID

28. `get_labels_summary` - Get labels summary statistics
    - No parameters required

29. `get_label_hosts` - Get hosts that match a specific label
    - Parameters:
      - `id` (required): The label ID
      - Additional optional filters: page, per_page, order_key, order_direction, query, status, team_id

30. `list_scripts` - List all scripts in Fleet
    - Parameters:
      - `team_id` (optional): Filter by team ID
      - `page` (optional): Page number for pagination
      - `per_page` (optional): Number of results per page

31. `get_script` - Get details for a specific script
    - Parameters:
      - `id` (required): The script ID
      - `alt` (optional): Set to "media" to download the script file
      - `team_id` (optional): Team ID (required for team scripts)

32. `get_script_results` - Get results for a script execution
    - Parameters:
      - `execution_id` (required): The script execution ID

33. `list_software_versions` - List software versions
    - Parameters: page, per_page, order_key, order_direction, query, team_id, vulnerable (all optional)

34. `get_software_version` - Get details for a specific software version
    - Parameters:
      - `id` (required): The software version ID
      - `team_id` (optional): Filter by team ID

35. `list_app_store_apps` - List available App Store apps
    - Parameters:
      - `team_id` (optional): Filter by team ID
      - `platform` (optional): Filter by platform

36. `list_fleet_maintained_apps` - List Fleet-maintained apps
    - Parameters: team_id, platform, page, per_page, order_key, order_direction, query (all optional)

37. `get_fleet_maintained_app` - Get details for a specific Fleet-maintained app
    - Parameters:
      - `id` (required): The Fleet-maintained app ID

38. `list_invites` - List all invites in Fleet
    - Parameters: page, per_page, order_key, order_direction, query (all optional)

39. `get_invite` - Get details for a specific invite
    - Parameters:
      - `token` (required): The invite token

### Available Resources

The current implementation focuses on tools rather than resources. The MCP server provides tools for querying hosts, managing software, and performing actions on Fleet-managed devices.

### Example Prompts

Here are some example prompts you can use with Cline to test the Fleet MCP server:

- "List all hosts managed by Fleet"
- "List Windows hosts that belong to roadrunner@acme.com"
- "List hosts by label ID 5"
- "Get details for host with ID 123"
- "Show me the Fleet server version"
- "List all teams in Fleet"
- "Get details for team ID 1"
- "Show all global policies"
- "List policies for team ID 1"
- "List all queries available in Fleet"
- "Show software titles installed across the fleet"
- "List all users in Fleet"
- "Get the count of hosts in Fleet"
- "Show host summary statistics"
- "Get MDM enrollment summary"
- "List recent activities in Fleet"
- "Show Fleet configuration"
- "List all labels"
- "Show hosts that match label ID 5"
- "List all scripts available"
- "Show vulnerabilities in the fleet"
- "List OS versions across hosts"
- "Show available App Store apps"
- "List Fleet-maintained apps"
- "Show all pending invites"
- "Show me all software installed on host with ID 755"
- "Check if TeamViewer is installed on host with ID 755"
- "Show me software available for installation on host with ID 755"
- "Install TeamViewer on host with ID 755"

## Recent Improvements

The Fleet MCP server has been enhanced with the following improvements:

### Software Management

- **Improved Software Detection**: The server now correctly identifies installed software by checking both `installed_versions` and `status="installed"` fields.
- **Pagination Support**: Added `per_page=200` parameter to ensure comprehensive software listings.
- **Intuitive Parameter Handling**: When `available_for_install` is set to true, the server automatically sets `installed_only` to false for consistent behavior.
- **Software Name Filtering**: Added ability to filter software by name for easier identification of specific applications.

### Host Management

- **Email Filtering**: Added support for filtering hosts by user email using the device_mapping field.
- **Team Filtering**: Added support for filtering hosts by team ID.

### Software Installation

- Added support for installing software on managed devices through the Fleet API.

## Updating

To check for updates to the Fleet MCP server:

```bash
npm run check-updates
```

If updates are available, you can update the server by:

1. If you installed via git:
   ```bash
   git pull
   npm install
   npm run build
   ```

2. If you downloaded a zip file:
   - Download the latest version
   - Replace your files
   - Run `npm install && npm run build`

## Uninstalling

To uninstall the Fleet MCP server from Cline:

```bash
npm run uninstall-mcp
```

This script will:
1. Remove the Fleet MCP server configuration from Cline and/or Claude Desktop
2. Ask if you want to keep the server files
3. Provide instructions for completely removing the server files if desired

## Troubleshooting

If you encounter issues with the Fleet MCP server, you can run the troubleshooting script:

```bash
npm run troubleshoot
```

This script will check for common issues:
1. Environment variables configuration
2. Build directory and server executable
3. Server running status
4. Cline configuration

The script will provide recommendations for fixing any issues it finds.

## With Claude Code

mcp-servers.json:

```json
{
  "mcpServers": {
    "fleet": {
      "type": "sse",
      "url": "http://localhost:3000/mcp",
      "disabled": false,
      "alwaysAllow": [
        "get_host",
        "list_hosts",
        "list_host_software"
      ],
      "timeout": 15
    }
  }
}
```

Sample prompt:

```
claude -p "Does Victor's hosts have Microsoft Edge installed?" --mcp-config mcp-servers.json --allowedTools 'mcp__fleet__get_host,mcp__fleet__list_hosts,mcp__fleet__list_host_software' --output-format stream-json --system-prompt "You are an IT admin." --verbose
```

## Run Fleet MCP server in production using PM2

```
npm install -g pm2
pm2 start npm --name "fleet-mcp" -- start
pm2 logs fleet-mcp   # See logs live
pm2 save             # Save the current process list
pm2 startup          # Setup PM2 to auto-start on reboot
```

## Development

### Project Structure

```
fleet-mcp/
├── src/                    # TypeScript source code
│   ├── index.ts            # Main server implementation
│   ├── test-client.ts      # Test client for the MCP server
│   ├── test-fleet-api.ts   # Test script for Fleet API connection
│   ├── install-mcp.ts      # Script to install MCP to Cline
│   ├── uninstall-mcp.ts    # Script to uninstall MCP from Cline
│   ├── update-credentials.ts # Script to update Fleet API credentials
│   ├── test-with-cline.ts  # Script to test with Cline
│   ├── troubleshoot.ts     # Script to troubleshoot common issues
│   └── check-updates.ts    # Script to check for updates
├── build/                  # Compiled JavaScript (generated)
├── .env.example            # Example environment variables
├── .env                    # Environment variables (create this)
├── package.json            # Project dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── README.md               # This file
```

### Scripts

- `npm run build` - Build the TypeScript code
- `npm start` - Start the server
- `npm run dev` - Run TypeScript in watch mode
- `npm run lint` - Run ESLint
- `npm run test-server` - Test the MCP server locally
- `npm run test-fleet-api` - Test the Fleet API connection
- `npm run test-with-cline` - Test the MCP server with Cline
- `npm run install-mcp` - Install the MCP server to Cline
- `npm run uninstall-mcp` - Uninstall the MCP server from Cline
- `npm run update-credentials` - Update Fleet API credentials
- `npm run check-updates` - Check for updates to the MCP server
- `npm run troubleshoot` - Troubleshoot common issues

## Extending

To add more Fleet API functionality:

1. Add new tool definitions in the `setupRoutes` method
2. Implement the tool logic in the route handler
3. Add new resource definitions as needed

## License

MIT
