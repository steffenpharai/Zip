#!/bin/bash
# Development helper script for Docker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}ZIP Docker Development Helper${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found. Creating from .env.example if available...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}Created .env from .env.example${NC}"
        echo -e "${YELLOW}Please edit .env and add your OPENAI_API_KEY${NC}"
    else
        echo -e "${YELLOW}Please create .env file with required environment variables${NC}"
    fi
fi

# Parse command line arguments
COMMAND="${1:-up}"
SERVICE="${2:-}"

case "$COMMAND" in
    up|start)
        echo -e "${GREEN}Starting development services...${NC}"
        if [ -z "$SERVICE" ]; then
            docker-compose up
        else
            docker-compose up "$SERVICE"
        fi
        ;;
    down|stop)
        echo -e "${GREEN}Stopping development services...${NC}"
        docker-compose down
        ;;
    build)
        echo -e "${GREEN}Building development containers...${NC}"
        docker-compose build --no-cache
        ;;
    logs)
        echo -e "${GREEN}Viewing logs...${NC}"
        if [ -z "$SERVICE" ]; then
            docker-compose logs -f
        else
            docker-compose logs -f "$SERVICE"
        fi
        ;;
    shell)
        SERVICE="${SERVICE:-zip-app}"
        echo -e "${GREEN}Opening shell in $SERVICE...${NC}"
        docker-compose exec "$SERVICE" sh
        ;;
    clean)
        echo -e "${YELLOW}Cleaning up development environment...${NC}"
        docker-compose down -v
        docker volume prune -f
        echo -e "${GREEN}Cleanup complete${NC}"
        ;;
    restart)
        echo -e "${GREEN}Restarting services...${NC}"
        docker-compose restart
        ;;
    *)
        echo "Usage: $0 {up|down|build|logs|shell|clean|restart} [service]"
        echo ""
        echo "Commands:"
        echo "  up       - Start services (default)"
        echo "  down     - Stop services"
        echo "  build    - Rebuild containers"
        echo "  logs     - View logs (optionally for specific service)"
        echo "  shell    - Open shell in container (default: zip-app)"
        echo "  clean    - Stop and remove containers and volumes"
        echo "  restart  - Restart services"
        echo ""
        echo "Examples:"
        echo "  $0 up"
        echo "  $0 up robot-bridge"
        echo "  $0 logs zip-app"
        echo "  $0 shell robot-bridge"
        exit 1
        ;;
esac

