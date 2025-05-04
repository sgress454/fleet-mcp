import axios from 'axios';
import { config } from 'dotenv';

// Load environment variables
config();

// Fleet API configuration
const FLEET_SERVER_URL = process.env.FLEET_SERVER_URL || 'https://fleet.example.com/api';
const FLEET_API_KEY = process.env.FLEET_API_KEY;

if (!FLEET_API_KEY) {
  console.error('FLEET_API_KEY environment variable is required');
  process.exit(1);
}

/**
 * Test the Fleet API connection
 */
async function testFleetApiConnection(): Promise<void> {
  console.log('Testing Fleet API connection...');
  console.log(`API URL: ${FLEET_SERVER_URL}`);
  
  try {
    // Create axios instance with Fleet API configuration
    const axiosInstance = axios.create({
      baseURL: FLEET_SERVER_URL,
      headers: {
        'Authorization': `Bearer ${FLEET_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    // Test the connection by making a request to the health endpoint
    const response = await axiosInstance.get('/healthz');
    
    console.log('Connection successful!');
    console.log('API response:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error connecting to Fleet API:');
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error('Response data:', error.response.data);
      } else if (error.request) {
        console.error('No response received from server');
        console.error('Request:', error.request);
      } else {
        console.error('Error message:', error.message);
      }
    } else {
      console.error(error);
    }
    
    console.log('\nTroubleshooting tips:');
    console.log('1. Check that your FLEET_API_URL is correct');
    console.log('2. Verify your FLEET_API_KEY is valid');
    console.log('3. Ensure the Fleet server is running and accessible');
    console.log('4. Check network connectivity and firewall settings');
  }
}

// Run the test
testFleetApiConnection();