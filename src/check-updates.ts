import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

/**
 * Script to check for updates to the Fleet MCP server
 */
async function checkForUpdates(): Promise<void> {
  try {
    console.log('Checking for updates to Fleet MCP server...');
    
    // Get current version from package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const currentVersion = packageJson.version;
    
    console.log(`Current version: ${currentVersion}`);
    
    // Check if git is available
    try {
      await exec('git --version');
      
      // Check if this is a git repository
      try {
        await exec('git rev-parse --is-inside-work-tree');
        
        // Check for updates
        console.log('Checking for updates from git repository...');
        
        try {
          const { stdout: remoteOutput } = await exec('git remote -v');
          
          if (remoteOutput.trim() === '') {
            console.log('No git remote configured. Cannot check for updates.');
          } else {
            try {
              // Fetch the latest changes
              await exec('git fetch');
              
              // Check if we're behind the remote
              const { stdout: statusOutput } = await exec('git status -uno');
              
              if (statusOutput.includes('Your branch is behind')) {
                console.log('✅ Updates available!');
                console.log('To update, run: git pull');
              } else {
                console.log('✅ You are running the latest version.');
              }
            } catch (error) {
              console.log('Error checking git status:', error);
            }
          }
        } catch (error) {
          console.log('Error checking git remote:', error);
        }
      } catch (error) {
        console.log('This is not a git repository. Cannot check for updates.');
      }
    } catch (error) {
      console.log('Git is not available. Cannot check for updates.');
    }
    
    // Provide manual update instructions
    console.log('\nManual update instructions:');
    console.log('1. If you installed via git: run "git pull"');
    console.log('2. If you downloaded a zip: download the latest version and replace your files');
    console.log('3. After updating, run: npm install && npm run build');
  } catch (error) {
    console.error('Error checking for updates:', error);
  }
}

// Run the check
checkForUpdates();