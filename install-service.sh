node create_systemd_conf.cjs
sudo cp fleet-mcp.service /etc/systemd/system/fleet-mcp.service
sudo systemctl daemon-reload
sudo systemctl enable fleet-mcp.service
sudo systemctl start fleet-mcp.service
rm fleet-mcp.service