SWAG := $(shell go env GOPATH)/bin/swag

.PHONY: dev-api dev-web api test check

dev-api: ## Run the API on :8080 (needs Postgres and APP_SECRET)
	cd backend && go run ./cmd/server

dev-web: ## Run the frontend on :5173, proxying /api to :8080
	cd frontend && npm run dev

api: ## Regenerate swagger from the Go annotations, then the React Query hooks from swagger
	@test -x $(SWAG) || go install github.com/swaggo/swag/cmd/swag@v1.16.4
	cd backend && $(SWAG) init -g cmd/server/main.go -o docs --outputTypes json,yaml --parseInternal --requiredByDefault
	cd frontend && npm run api

test: ## Unit tests: the validator, the analysis loop, the drawing geometry
	cd backend && go test ./...
	cd frontend && npm test

check: api test ## Everything CI should run
	cd backend && go vet ./... && test -z "$$(gofmt -l .)"
	cd frontend && npm run lint && npm run build
	git diff --exit-code -- backend/docs frontend/src/api/generated
