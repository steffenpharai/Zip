#!/bin/bash
# Health check script for Docker services

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}ZIP Docker Health Check${NC}"
echo ""

# Check if jq is available
if ! command -v jq &> /dev/null; then
    JQ_AVAILABLE=false
    echo -e "${YELLOW}Note: jq not found, JSON output will not be formatted${NC}"
else
    JQ_AVAILABLE=true
fi

# Function to check health endpoint
check_health() {
    local name=$1
    local url=$2
    
    echo -n "Checking $name... "
    
    if curl -s -f "$url" > /tmp/health_response.json 2>/dev/null; then
        if [ "$JQ_AVAILABLE" = true ]; then
            echo -e "${GREEN}✓ Healthy${NC}"
            cat /tmp/health_response.json | jq .
        else
            echo -e "${GREEN}✓ Healthy${NC}"
            cat /tmp/health_response.json
        fi
        echo ""
        return 0
    else
        echo -e "${RED}✗ Unhealthy or not responding${NC}"
        echo ""
        return 1
    fi
}

# Check ZIP app
check_health "ZIP App" "http://localhost:3000/api/health"

# Check robot bridge
check_health "Robot Bridge" "http://localhost:8766/health"

# Check Docker containers
echo -e "${BLUE}Container Status:${NC}"
docker-compose ps 2>/dev/null || docker-compose -f docker-compose.prod.yml ps 2>/dev/null || echo "No containers running"

# Cleanup
rm -f /tmp/health_response.json

echo -e "${GREEN}Health check complete${NC}"

