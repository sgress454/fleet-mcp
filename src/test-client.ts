import axios from 'axios';

/**
 * Simple test client for the Fleet MCP server
 */
async function testMcpServer(): Promise<void> {
  const baseUrl = 'http://localhost:3000/mcp';
  
  try {
    // Test server metadata
    console.log('Testing server metadata...');
    const metadataResponse = await axios.get(baseUrl);
    console.log('Server metadata:', metadataResponse.data);
    console.log('---\n');
    
    // Test listing tools
    console.log('Testing tool listing...');
    const toolsResponse = await axios.get(`${baseUrl}/tools`);
    console.log('Available tools:', toolsResponse.data.tools.map((t: any) => t.name));
    console.log('---\n');
    
    // Test calling a tool
    console.log('Testing tool execution...');
    const toolCallResponse = await axios.post(`${baseUrl}/tools/query_devices/call`, {
      arguments: {
        platform: 'macOS',
        limit: 2
      }
    });
    console.log('Tool execution result:');
    console.log(toolCallResponse.data.content[0].text);
    console.log('---\n');
    
    // Test listing resources
    console.log('Testing resource listing...');
    const resourcesResponse = await axios.get(`${baseUrl}/resources`);
    console.log('Available resources:', resourcesResponse.data.resources.map((r: any) => r.uri));
    console.log('---\n');
    
    // Test reading a resource
    console.log('Testing resource reading...');
    const resourceReadResponse = await axios.get(`${baseUrl}/resources/read?uri=${encodeURIComponent('fleet://devices/summary')}`);
    console.log('Resource content:');
    console.log(resourceReadResponse.data.contents[0].text);
    console.log('---\n');
    
    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Error testing MCP server:', error);
  }
}

// Run the tests
testMcpServer();