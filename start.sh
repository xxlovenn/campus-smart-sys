#!/usr/bin/env bash
set -euo pipefail

TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-240}"

assert_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

assert_docker_ready() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not ready. Please start Docker first." >&2
    exit 1
  fi
}

wait_service_healthy() {
  local service="$1"
  local timeout="$2"
  local deadline=$((SECONDS + timeout))

  while (( SECONDS < deadline )); do
    local container_id
    container_id="$(docker compose ps -q "$service" | tr -d '[:space:]')"

    if [[ -z "$container_id" ]]; then
      sleep 2
      continue
    fi

    local status
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"

    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      echo "[ok] $service status: $status"
      return
    fi

    echo "[wait] $service status: $status"
    sleep 3
  done

  echo "Timed out waiting for service '$service' to become healthy." >&2
  exit 1
}

echo "== Campus Smart System one-click start =="
assert_command docker
assert_docker_ready

echo "[step] Building and starting containers..."
docker compose up -d --build

echo "[step] Waiting for backend/frontend health checks..."
wait_service_healthy "backend" "$TIMEOUT_SECONDS"
wait_service_healthy "frontend" "$TIMEOUT_SECONDS"

echo
echo "Deployment completed."
echo "Frontend: http://localhost:3000"
echo "Backend health: http://localhost:3001/api/health"
