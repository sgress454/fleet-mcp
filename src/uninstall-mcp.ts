import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

/**
 * Script to uninstall the Fleet MCP server from Cline configuration
 */
async function uninstallMcpServer(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, (answer) => {
        resolve(answer);
      });
    });
  };

  try {
    console.log('Fleet MCP Server Uninstaller');
    console.log('===========================');
    
    // Determine the user's home directory
    const homeDir = os.homedir();
    
    // Paths to Cline, Roo Code, and Claude Desktop config files
    const clineConfigPath = path.join(
      homeDir,
      'Library',
      'Application Support',
      'Code',
      'User',
      'globalStorage',
      'rooveterinaryinc.roo-cline',
      'settings',
      'mcp_settings.json'
    );
    
    const rooCodeConfigPath = path.join(
      homeDir,
      'Library',
      'Application Support',
      'Roo Code',
      'globalStorage',
      'rooveterinaryinc.roo-cline',
      'settings',
      'mcp_settings.json'
    );
    
    const claudeConfigPath = path.join(
      homeDir,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    );
    
    // Function to remove the Fleet MCP server from a config file
    const removeFromConfigFile = (configPath: string): boolean => {
      if (fs.existsSync(configPath)) {
        // Read existing config
        const configContent = fs.readFileSync(configPath, 'utf-8');
        let config;
        
        try {
          config = JSON.parse(configContent);
        } catch (error) {
          console.error(`Error parsing ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
          return false;
        }
        
        // Check if the Fleet MCP server is configured
        if (config.mcpServers && config.mcpServers.fleet) {
          // Remove the Fleet MCP server
          delete config.mcpServers.fleet;
          
          // Write updated config
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
          console.log(`✅ Removed Fleet MCP server from ${configPath}`);
          return true;
        } else {
          console.log(`Fleet MCP server not found in ${configPath}`);
          return false;
        }
      } else {
        console.log(`Config file not found: ${configPath}`);
        return false;
      }
    };
    
    // Confirm uninstallation
    const confirm = await question('Are you sure you want to uninstall the Fleet MCP server from Cline/Roo Code? (y/n): ');
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('Uninstallation cancelled.');
      rl.close();
      return;
    }
    
    // Try to uninstall from Cline
    console.log('\nUninstalling Fleet MCP server from Cline...');
    const clineResult = removeFromConfigFile(clineConfigPath);
    
    // Try to uninstall from Roo Code
    console.log('\nUninstalling Fleet MCP server from Roo Code...');
    const rooCodeResult = removeFromConfigFile(rooCodeConfigPath);
    
    // Try to uninstall from Claude Desktop
    console.log('\nUninstalling Fleet MCP server from Claude Desktop...');
    const claudeResult = removeFromConfigFile(claudeConfigPath);
    
    if (clineResult || rooCodeResult || claudeResult) {
      console.log('\nUninstallation complete!');
      console.log('The Fleet MCP server has been removed from your configuration.');
      console.log('You may need to restart Cline, Roo Code, or Claude Desktop for the changes to take effect.');
    } else {
      console.log('\nUninstallation failed.');
      console.log('The Fleet MCP server was not found in your Cline, Roo Code, or Claude Desktop configuration.');
    }
    
    // Ask if the user wants to keep the server files
    const keepFiles = await question('\nDo you want to keep the Fleet MCP server files? (y/n): ');
    
    if (keepFiles.toLowerCase() !== 'y' && keepFiles.toLowerCase() !== 'yes') {
      console.log('\nTo completely remove the Fleet MCP server files:');
      console.log('1. Delete this directory');
      console.log('2. Or run: rm -rf /path/to/fleet-mcp');
    } else {
      console.log('\nThe Fleet MCP server files have been kept.');
      console.log('You can reinstall the server later by running: npm run install-mcp');
    }
  } catch (error) {
    console.error('Error uninstalling MCP server:', error);
  } finally {
    rl.close();
  }
}

// Run the uninstallation
uninstallMcpServer();