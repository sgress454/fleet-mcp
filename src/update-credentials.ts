import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

/**
 * Script to update Fleet API credentials in .env file
 */
async function updateCredentials(): Promise<void> {
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
    console.log('Fleet API Credentials Update');
    console.log('============================');
    
    // Get current values from .env file if it exists
    const envPath = path.join(process.cwd(), '.env');
    let currentUrl = '';
    let currentKey = '';
    
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const urlMatch = envContent.match(/FLEET_SERVER_URL=(.+)/);
      const keyMatch = envContent.match(/FLEET_API_KEY=(.+)/);
      
      if (urlMatch && urlMatch[1]) {
        currentUrl = urlMatch[1];
      }
      
      if (keyMatch && keyMatch[1]) {
        currentKey = keyMatch[1];
      }
    }
    
    // Prompt for new values
    const newUrl = await question(`Fleet Server URL [${currentUrl || 'https://fleet.example.com/api'}]: `);
    const newKey = await question(`Fleet API Key [${currentKey ? '********' : 'your_api_key_here'}]: `);
    
    // Prepare new .env content
    const fleetServerUrl = newUrl || currentUrl || 'https://fleet.example.com/api';
    const fleetApiKey = newKey || currentKey || 'your_api_key_here';
    
    const envContent = `# Fleet API Configuration
FLEET_SERVER_URL=${fleetServerUrl}
FLEET_API_KEY=${fleetApiKey}
`;
    
    // Write to .env file
    fs.writeFileSync(envPath, envContent, 'utf-8');
    
    console.log('\nCredentials updated successfully!');
    console.log(`Server URL: ${fleetServerUrl}`);
    console.log(`API Key: ${fleetApiKey.replace(/./g, '*')}`);
    
    console.log('\nYou can now test your connection with:');
    console.log('npm run test-fleet-api');
  } catch (error) {
    console.error('Error updating credentials:', error);
  } finally {
    rl.close();
  }
}

// Run the update
updateCredentials();