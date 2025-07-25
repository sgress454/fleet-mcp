
const fs = require('fs');
const path = require('path');

// Load the configuration template
const templatePath = path.join(__dirname, '.systemd_template');
const template = fs.readFileSync(templatePath, 'utf8');

// Replace ${DIR} in the template with the directory of this script
const dir = path.dirname(__filename);
let configContent = template.replace(/\$\{DIR\}/g, dir);

// Replace ${USER} in the template with the current user
const user = process.env.USER || process.env.USERNAME;
configContent = configContent.replace(/\$\{USER\}/g, user);

// Output the final configuration to a file
const outputPath = path.join(dir, 'fleet-mcp.service');
fs.writeFileSync(outputPath, configContent);