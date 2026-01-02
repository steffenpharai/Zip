#!/bin/bash
# Production helper script for Docker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}ZIP Docker Production Helper${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create .env file with required environment variables"
    exit 1
fi

# Parse command line arguments
COMMAND="${1:-up}"

case "$COMMAND" in
    build)
        echo -e "${GREEN}Building production images...${NC}"
        docker-compose -f docker-compose.prod.yml build --no-cache
        echo -e "${GREEN}Build complete${NC}"
        ;;
    up|start)
        echo -e "${GREEN}Starting production services...${NC}"
        docker-compose -f docker-compose.prod.yml up -d
        echo -e "${GREEN}Services started${NC}"
        echo "View logs with: docker-compose -f docker-compose.prod.yml logs -f"
        ;;
    down|stop)
        echo -e "${GREEN}Stopping production services...${NC}"
        docker-compose -f docker-compose.prod.yml down
        echo -e "${GREEN}Services stopped${NC}"
        ;;
    logs)
        echo -e "${GREEN}Viewing production logs...${NC}"
        docker-compose -f docker-compose.prod.yml logs -f
        ;;
    restart)
        echo -e "${GREEN}Restarting production services...${NC}"
        docker-compose -f docker-compose.prod.yml restart
        echo -e "${GREEN}Services restarted${NC}"
        ;;
    ps|status)
        echo -e "${GREEN}Production service status:${NC}"
        docker-compose -f docker-compose.prod.yml ps
        ;;
    *)
        echo "Usage: $0 {build|up|down|logs|restart|ps}"
        echo ""
        echo "Commands:"
        echo "  build    - Build production images"
        echo "  up       - Start production services (detached)"
        echo "  down     - Stop production services"
        echo "  logs     - View logs"
        echo "  restart  - Restart services"
        echo "  ps       - Show service status"
        exit 1
        ;;
esac

