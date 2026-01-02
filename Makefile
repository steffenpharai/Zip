.PHONY: help dev dev:app dev:robot dev:build dev:logs dev:shell dev:clean prod:build prod:up prod:down health robot:serial

# Default target
help:
	@echo "ZIP Docker Development Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev              - Start all development services"
	@echo "  make dev:app          - Start only ZIP app"
	@echo "  make dev:robot        - Start only robot bridge"
	@echo "  make dev:build        - Rebuild all development containers"
	@echo "  make dev:logs         - View logs (all services)"
	@echo "  make dev:logs SERVICE=zip-app - View logs for specific service"
	@echo "  make dev:shell        - Open shell in ZIP app container"
	@echo "  make dev:shell SERVICE=robot-bridge - Open shell in robot bridge"
	@echo "  make dev:clean        - Stop and remove all containers, volumes"
	@echo ""
	@echo "Production:"
	@echo "  make prod:build       - Build production images"
	@echo "  make prod:up          - Start production environment"
	@echo "  make prod:down        - Stop production environment"
	@echo ""
	@echo "Utilities:"
	@echo "  make health           - Check health of all services"
	@echo "  make robot:serial     - List available serial ports"

# Development commands
dev:
	docker-compose up

dev:app:
	docker-compose up zip-app

dev:robot:
	docker-compose up robot-bridge

dev:build:
	docker-compose build --no-cache

dev:logs:
	@if [ -z "$(SERVICE)" ]; then \
		docker-compose logs -f; \
	else \
		docker-compose logs -f $(SERVICE); \
	fi

dev:shell:
	@if [ -z "$(SERVICE)" ]; then \
		docker-compose exec zip-app sh; \
	else \
		docker-compose exec $(SERVICE) sh; \
	fi

dev:clean:
	docker-compose down -v
	docker volume prune -f

# Production commands
prod:build:
	docker-compose -f docker-compose.prod.yml build --no-cache

prod:up:
	docker-compose -f docker-compose.prod.yml up -d

prod:down:
	docker-compose -f docker-compose.prod.yml down

# Health checks
health:
	@echo "Checking ZIP app health..."
	@curl -s http://localhost:3000/api/health | jq . || echo "ZIP app not responding"
	@echo ""
	@echo "Checking robot bridge health..."
	@curl -s http://localhost:8766/health | jq . || echo "Robot bridge not responding"

# Serial port listing (requires serialport tools)
robot:serial:
	@echo "Available serial ports:"
	@docker-compose exec robot-bridge node -e "require('serialport').SerialPort.list().then(ports => console.log(JSON.stringify(ports, null, 2)))" || echo "Run 'make dev:robot' first"

