Param(
  [int]$TimeoutSeconds = 240
)

$ErrorActionPreference = "Stop"

function Assert-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $name"
  }
}

function Assert-DockerReady {
  try {
    docker info | Out-Null
  } catch {
    throw "Docker daemon is not ready. Please start Docker Desktop first."
  }
}

function Wait-ServiceHealthy([string]$service, [int]$timeoutSec) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    $containerId = (docker compose ps -q $service).Trim()
    if (-not $containerId) {
      Start-Sleep -Seconds 2
      continue
    }

    $status = (docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $containerId).Trim()
    if ($status -eq "healthy" -or $status -eq "running") {
      Write-Host "[ok] $service status: $status"
      return
    }

    Write-Host "[wait] $service status: $status"
    Start-Sleep -Seconds 3
  }

  throw "Timed out waiting for service '$service' to become healthy."
}

Write-Host "== Campus Smart System one-click start =="
Assert-Command "docker"
Assert-DockerReady

Write-Host "[step] Building and starting containers..."
docker compose up -d --build

Write-Host "[step] Waiting for backend/frontend health checks..."
Wait-ServiceHealthy -service "backend" -timeoutSec $TimeoutSeconds
Wait-ServiceHealthy -service "frontend" -timeoutSec $TimeoutSeconds

Write-Host ""
Write-Host "Deployment completed."
Write-Host "Frontend: http://localhost:3000"
Write-Host "Backend health: http://localhost:3001/api/health"
