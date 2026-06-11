#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/api"
DASHBOARD_DIR="$ROOT_DIR/dashboard"
COMPOSE_FILE="$API_DIR/docker-compose.yml"
STATE_DIR="$ROOT_DIR/.manager"
LOG_DIR="$STATE_DIR/logs"
PID_DIR="$STATE_DIR/pids"

RED="$(printf '\033[0;31m')"
GREEN="$(printf '\033[0;32m')"
YELLOW="$(printf '\033[1;33m')"
BLUE="$(printf '\033[0;34m')"
BOLD="$(printf '\033[1m')"
NC="$(printf '\033[0m')"

PACKAGE_MANAGER=""
DATABASE_KIND=""
ORM_KIND=""
API_PORT=""
DASHBOARD_PORT=""
API_BASE_URL=""
API_HEALTH_URL=""
SWAGGER_URL=""
DASHBOARD_URL=""
POSTGRES_SERVICE=""
REDIS_SERVICE=""
API_SERVICE=""
POSTGRES_USER=""
POSTGRES_DB=""
POSTGRES_PASSWORD=""

mkdir -p "$LOG_DIR" "$PID_DIR"

print_header() {
  clear
  printf "%b\n" "${BOLD}${BLUE}SID3 Manager${NC}"
  printf "%b\n" "${BLUE}Painel local do monolito: API + dashboard${NC}"
  printf "\n"
}

info() {
  printf "%b\n" "${BLUE}[$(date +%H:%M:%S)]${NC} $*"
}

success() {
  printf "%b\n" "${GREEN}$*${NC}"
}

warn() {
  printf "%b\n" "${YELLOW}$*${NC}"
}

error() {
  printf "%b\n" "${RED}$*${NC}" >&2
}

pause() {
  printf "\n"
  read -r -p "Pressione ENTER para continuar..."
}

confirm() {
  local message="$1"
  local answer=""
  read -r -p "$message [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

ensure_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    error "Comando obrigatorio ausente: $cmd"
    return 1
  fi
}

detect_package_manager() {
  if [[ -f "$API_DIR/pnpm-lock.yaml" || -f "$DASHBOARD_DIR/pnpm-lock.yaml" || -f "$ROOT_DIR/pnpm-workspace.yaml" ]]; then
    PACKAGE_MANAGER="pnpm"
  elif [[ -f "$ROOT_DIR/yarn.lock" ]]; then
    PACKAGE_MANAGER="yarn"
  elif [[ -f "$ROOT_DIR/bun.lockb" || -f "$ROOT_DIR/bun.lock" ]]; then
    PACKAGE_MANAGER="bun"
  elif [[ -f "$ROOT_DIR/package-lock.json" || -f "$API_DIR/package-lock.json" || -f "$DASHBOARD_DIR/package-lock.json" ]]; then
    PACKAGE_MANAGER="npm"
  else
    PACKAGE_MANAGER="npm"
  fi
}

detect_database() {
  if [[ -f "$API_DIR/prisma/schema.prisma" ]] && grep -q 'provider = "postgresql"' "$API_DIR/prisma/schema.prisma"; then
    DATABASE_KIND="PostgreSQL"
  else
    DATABASE_KIND="desconhecido"
  fi
}

detect_orm() {
  if [[ -f "$API_DIR/prisma/schema.prisma" ]]; then
    ORM_KIND="Prisma"
  else
    ORM_KIND="desconhecido"
  fi
}

detect_ports_and_urls() {
  API_PORT="$(sed -n 's/^PORT=\([0-9][0-9]*\)$/\1/p' "$API_DIR/.env.example" | head -n 1)"
  [[ -n "$API_PORT" ]] || API_PORT="3000"

  DASHBOARD_PORT="$(sed -n 's/.*--port \([0-9][0-9]*\).*/\1/p' "$DASHBOARD_DIR/package.json" | head -n 1)"
  [[ -n "$DASHBOARD_PORT" ]] || DASHBOARD_PORT="4200"

  API_BASE_URL="http://localhost:${API_PORT}/api/v1"
  API_HEALTH_URL="${API_BASE_URL}/health"
  SWAGGER_URL="http://localhost:${API_PORT}/docs"
  DASHBOARD_URL="http://localhost:${DASHBOARD_PORT}"
}

detect_services_from_compose() {
  POSTGRES_SERVICE=""
  REDIS_SERVICE=""
  API_SERVICE=""

  [[ -f "$COMPOSE_FILE" ]] || return 0

  while IFS= read -r service; do
    case "$service" in
      postgres) POSTGRES_SERVICE="$service" ;;
      redis) REDIS_SERVICE="$service" ;;
      api) API_SERVICE="$service" ;;
    esac
  done < <(docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null || true)

  if [[ -z "$POSTGRES_SERVICE" ]] && grep -q '^  postgres:' "$COMPOSE_FILE"; then
    POSTGRES_SERVICE="postgres"
  fi
  if [[ -z "$REDIS_SERVICE" ]] && grep -q '^  redis:' "$COMPOSE_FILE"; then
    REDIS_SERVICE="redis"
  fi
  if [[ -z "$API_SERVICE" ]] && grep -q '^  api:' "$COMPOSE_FILE"; then
    API_SERVICE="api"
  fi
}

detect_postgres_credentials() {
  POSTGRES_USER="$(sed -n 's/^[[:space:]]*POSTGRES_USER:[[:space:]]*\(.*\)$/\1/p' "$COMPOSE_FILE" | head -n 1 | tr -d '"' | xargs)"
  POSTGRES_DB="$(sed -n 's/^[[:space:]]*POSTGRES_DB:[[:space:]]*\(.*\)$/\1/p' "$COMPOSE_FILE" | head -n 1 | tr -d '"' | xargs)"
  POSTGRES_PASSWORD="$(sed -n 's/^[[:space:]]*POSTGRES_PASSWORD:[[:space:]]*\(.*\)$/\1/p' "$COMPOSE_FILE" | head -n 1 | tr -d '"' | xargs)"

  [[ -n "$POSTGRES_USER" ]] || POSTGRES_USER="postgres"
  [[ -n "$POSTGRES_DB" ]] || POSTGRES_DB="postgres"
  [[ -n "$POSTGRES_PASSWORD" ]] || POSTGRES_PASSWORD=""
}

detect_stack() {
  detect_package_manager
  detect_database
  detect_orm
  detect_ports_and_urls
  detect_services_from_compose
  detect_postgres_credentials
}

run_pm_in_dir() {
  local dir="$1"
  shift

  case "$PACKAGE_MANAGER" in
    pnpm) (cd "$dir" && pnpm "$@") ;;
    yarn) (cd "$dir" && yarn "$@") ;;
    bun) (cd "$dir" && bun "$@") ;;
    npm) (cd "$dir" && npm run "$@") ;;
    *) error "Package manager nao suportado: $PACKAGE_MANAGER"; return 1 ;;
  esac
}

run_script_in_dir() {
  local dir="$1"
  local script_name="$2"

  case "$PACKAGE_MANAGER" in
    pnpm) (cd "$dir" && pnpm "$script_name") ;;
    yarn) (cd "$dir" && yarn "$script_name") ;;
    bun) (cd "$dir" && bun run "$script_name") ;;
    npm) (cd "$dir" && npm run "$script_name") ;;
    *) error "Package manager nao suportado: $PACKAGE_MANAGER"; return 1 ;;
  esac
}

background_script() {
  local name="$1"
  local dir="$2"
  local script_name="$3"
  local pid_file="$PID_DIR/${name}.pid"
  local log_file="$LOG_DIR/${name}.log"

  if is_pid_running "$pid_file"; then
    warn "$name ja esta em execucao com PID $(cat "$pid_file")."
    return 0
  fi

  info "Iniciando $name em background..."
  (
    cd "$dir" || exit 1
    case "$PACKAGE_MANAGER" in
      pnpm) nohup pnpm "$script_name" >"$log_file" 2>&1 & ;;
      yarn) nohup yarn "$script_name" >"$log_file" 2>&1 & ;;
      bun) nohup bun run "$script_name" >"$log_file" 2>&1 & ;;
      npm) nohup npm run "$script_name" >"$log_file" 2>&1 & ;;
      *) exit 1 ;;
    esac
    echo $! >"$pid_file"
  )

  sleep 1
  if is_pid_running "$pid_file"; then
    success "$name iniciado. Log: $log_file"
  else
    error "Falha ao iniciar $name. Revise $log_file"
    return 1
  fi
}

is_pid_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1

  kill -0 "$pid" >/dev/null 2>&1
}

stop_background_process() {
  local name="$1"
  local pid_file="$PID_DIR/${name}.pid"

  if ! is_pid_running "$pid_file"; then
    warn "$name nao esta rodando via manager."
    rm -f "$pid_file"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"
  info "Parando $name (PID $pid)..."
  kill "$pid" >/dev/null 2>&1 || true
  sleep 1

  if kill -0 "$pid" >/dev/null 2>&1; then
    warn "$name ainda esta ativo, enviando SIGKILL..."
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi

  rm -f "$pid_file"
  success "$name parado."
}

ensure_docker() {
  ensure_cmd docker || return 1
  if ! docker info >/dev/null 2>&1; then
    error "Docker nao esta em execucao."
    return 1
  fi
}

ensure_compose() {
  ensure_docker || return 1
  if ! docker compose version >/dev/null 2>&1; then
    error "docker compose nao esta disponivel."
    return 1
  fi
  [[ -f "$COMPOSE_FILE" ]] || {
    error "Compose file nao encontrado em $COMPOSE_FILE"
    return 1
  }
}

ensure_package_manager() {
  ensure_cmd "$PACKAGE_MANAGER"
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :$port )" | grep -q ":$port"
    return $?
  fi

  return 1
}

show_urls() {
  printf "%b\n" "${BOLD}URLs detectadas${NC}"
  printf "Dashboard: %s\n" "$DASHBOARD_URL"
  printf "API:       %s\n" "$API_BASE_URL"
  printf "Health:    %s\n" "$API_HEALTH_URL"
  printf "Swagger:   %s\n" "$SWAGGER_URL"
}

install_dependencies() {
  ensure_package_manager || return 1
  info "Instalando dependencias da API..."
  case "$PACKAGE_MANAGER" in
    pnpm) (cd "$API_DIR" && pnpm install) || return 1 ;;
    yarn) (cd "$API_DIR" && yarn install) || return 1 ;;
    bun) (cd "$API_DIR" && bun install) || return 1 ;;
    npm) (cd "$API_DIR" && npm install) || return 1 ;;
  esac

  info "Instalando dependencias do dashboard..."
  case "$PACKAGE_MANAGER" in
    pnpm) (cd "$DASHBOARD_DIR" && pnpm install) || return 1 ;;
    yarn) (cd "$DASHBOARD_DIR" && yarn install) || return 1 ;;
    bun) (cd "$DASHBOARD_DIR" && bun install) || return 1 ;;
    npm) (cd "$DASHBOARD_DIR" && npm install) || return 1 ;;
  esac

  success "Dependencias instaladas."
}

compose_up_base() {
  ensure_compose || return 1
  info "Subindo postgres..."
  docker compose -f "$COMPOSE_FILE" up -d "$POSTGRES_SERVICE"
}

compose_up_with_redis() {
  ensure_compose || return 1
  if [[ -n "$REDIS_SERVICE" ]]; then
    info "Subindo postgres e redis..."
    docker compose -f "$COMPOSE_FILE" --profile optional up -d "$POSTGRES_SERVICE" "$REDIS_SERVICE"
  else
    warn "Redis nao foi detectado no compose."
    docker compose -f "$COMPOSE_FILE" up -d "$POSTGRES_SERVICE"
  fi
}

compose_stop_all() {
  ensure_compose || return 1
  docker compose -f "$COMPOSE_FILE" down
}

compose_status() {
  ensure_compose || return 1
  docker compose -f "$COMPOSE_FILE" ps
}

compose_logs() {
  ensure_compose || return 1
  docker compose -f "$COMPOSE_FILE" logs --tail=100
}

start_api() {
  ensure_package_manager || return 1
  background_script "api" "$API_DIR" "start:dev"
}

start_dashboard() {
  ensure_package_manager || return 1
  background_script "dashboard" "$DASHBOARD_DIR" "start"
}

start_monolith() {
  compose_up_base || return 1
  start_api || return 1
  start_dashboard || return 1
  show_urls
}

stop_monolith() {
  stop_background_process "api"
  stop_background_process "dashboard"
}

tail_manager_logs() {
  local choices=()
  [[ -f "$LOG_DIR/api.log" ]] && choices+=("$LOG_DIR/api.log")
  [[ -f "$LOG_DIR/dashboard.log" ]] && choices+=("$LOG_DIR/dashboard.log")

  if [[ "${#choices[@]}" -eq 0 ]]; then
    warn "Nao ha logs locais do manager."
    return 0
  fi

  tail -n 100 -f "${choices[@]}"
}

run_prisma_generate() {
  ensure_package_manager || return 1
  run_script_in_dir "$API_DIR" "prisma:generate"
}

run_prisma_migrate() {
  ensure_package_manager || return 1
  run_script_in_dir "$API_DIR" "prisma:migrate"
}

run_prisma_studio() {
  ensure_package_manager || return 1
  info "Iniciando Prisma Studio..."
  case "$PACKAGE_MANAGER" in
    pnpm) (cd "$API_DIR" && pnpm exec prisma studio) ;;
    yarn) (cd "$API_DIR" && yarn prisma studio) ;;
    bun) (cd "$API_DIR" && bunx prisma studio) ;;
    npm) (cd "$API_DIR" && npx prisma studio) ;;
  esac
}

open_postgres_shell() {
  ensure_compose || return 1
  ensure_service_running "$POSTGRES_SERVICE" || return 1
  docker compose -f "$COMPOSE_FILE" exec "$POSTGRES_SERVICE" sh
}

open_postgres_sql() {
  ensure_compose || return 1
  ensure_service_running "$POSTGRES_SERVICE" || return 1
  if [[ -n "$POSTGRES_PASSWORD" ]]; then
    docker compose -f "$COMPOSE_FILE" exec \
      -e PGPASSWORD="$POSTGRES_PASSWORD" \
      "$POSTGRES_SERVICE" \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
  else
    docker compose -f "$COMPOSE_FILE" exec \
      "$POSTGRES_SERVICE" \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
  fi
}

open_redis_cli() {
  ensure_compose || return 1
  if [[ -z "$REDIS_SERVICE" ]]; then
    warn "Redis nao foi detectado no compose."
    return 0
  fi
  ensure_service_running "$REDIS_SERVICE" || return 1
  docker compose -f "$COMPOSE_FILE" exec "$REDIS_SERVICE" redis-cli
}

flush_redis() {
  ensure_compose || return 1
  if [[ -z "$REDIS_SERVICE" ]]; then
    warn "Redis nao foi detectado no compose."
    return 0
  fi
  ensure_service_running "$REDIS_SERVICE" || return 1
  if confirm "Isso vai limpar todo o Redis. Continuar?"; then
    docker compose -f "$COMPOSE_FILE" exec "$REDIS_SERVICE" redis-cli flushall
  else
    warn "Operacao cancelada."
  fi
}

ensure_service_running() {
  local service="$1"
  [[ -n "$service" ]] || {
    error "Servico nao detectado."
    return 1
  }

  if docker compose -f "$COMPOSE_FILE" ps --status running "$service" | grep -q "$service"; then
    return 0
  fi

  warn "Servico $service nao esta em execucao."
  if confirm "Deseja iniciar $service agora?"; then
    if [[ "$service" == "$REDIS_SERVICE" ]]; then
      docker compose -f "$COMPOSE_FILE" --profile optional up -d "$service"
    else
      docker compose -f "$COMPOSE_FILE" up -d "$service"
    fi
    sleep 2
    return 0
  fi

  return 1
}

health_check_api() {
  ensure_cmd curl || return 1
  printf "%b\n" "${BOLD}Health check da API${NC}"
  if curl -fsS "$API_HEALTH_URL"; then
    printf "\n"
    success "API respondeu em $API_HEALTH_URL"
  else
    error "API nao respondeu em $API_HEALTH_URL"
    return 1
  fi
}

show_status() {
  print_header
  printf "%b\n" "${BOLD}Stack detectado${NC}"
  printf "Package manager: %s\n" "$PACKAGE_MANAGER"
  printf "Framework API:   NestJS\n"
  printf "Framework UI:    Angular\n"
  printf "Banco:           %s\n" "$DATABASE_KIND"
  printf "ORM:             %s\n" "$ORM_KIND"
  printf "\n"
  show_urls
  printf "\n"

  printf "%b\n" "${BOLD}Processos do manager${NC}"
  if is_pid_running "$PID_DIR/api.pid"; then
    printf "API local:       rodando (PID %s)\n" "$(cat "$PID_DIR/api.pid")"
  else
    printf "API local:       parado\n"
  fi
  if is_pid_running "$PID_DIR/dashboard.pid"; then
    printf "Dashboard local: rodando (PID %s)\n" "$(cat "$PID_DIR/dashboard.pid")"
  else
    printf "Dashboard local: parado\n"
  fi

  printf "\n"
  if [[ -f "$COMPOSE_FILE" ]]; then
    printf "%b\n" "${BOLD}Containers detectados${NC}"
    compose_status || true
  fi
}

show_port_diagnostics() {
  printf "%b\n" "${BOLD}Portas relevantes${NC}"
  for port in "$API_PORT" "$DASHBOARD_PORT" 5432 6379; do
    if port_in_use "$port"; then
      warn "Porta $port esta em uso."
      if command -v lsof >/dev/null 2>&1; then
        lsof -iTCP:"$port" -sTCP:LISTEN || true
      fi
    else
      success "Porta $port esta livre."
    fi
    printf "\n"
  done
}

run_api_checks() {
  ensure_package_manager || return 1
  info "Rodando typecheck da API..."
  run_script_in_dir "$API_DIR" "typecheck" || return 1
  info "Rodando testes da API..."
  run_script_in_dir "$API_DIR" "test" || return 1
  info "Rodando coverage da API..."
  run_script_in_dir "$API_DIR" "test:coverage" || return 1
  info "Rodando build da API..."
  run_script_in_dir "$API_DIR" "build" || return 1
}

run_dashboard_checks() {
  ensure_package_manager || return 1
  info "Rodando typecheck do dashboard..."
  run_script_in_dir "$DASHBOARD_DIR" "typecheck" || return 1
  info "Rodando teste do dashboard..."
  run_script_in_dir "$DASHBOARD_DIR" "test" || return 1
  info "Rodando build do dashboard..."
  run_script_in_dir "$DASHBOARD_DIR" "build" || return 1
}

run_secret_scan() {
  ensure_cmd node || return 1
  (cd "$ROOT_DIR" && node scripts/secret-scan.mjs)
}

run_smoke_test() {
  ensure_cmd node || return 1
  (cd "$ROOT_DIR" && SID3_API_BASE_URL="$API_BASE_URL" node scripts/smoke-google-drive.mjs)
}

cleanup_build_artifacts() {
  info "Removendo artefatos locais..."
  rm -rf "$API_DIR/dist" "$API_DIR/coverage" "$DASHBOARD_DIR/dist" "$DASHBOARD_DIR/.angular"
  success "Artefatos limpos."
}

reinstall_dependencies() {
  if ! confirm "Isso vai remover node_modules de API e dashboard. Continuar?"; then
    warn "Operacao cancelada."
    return 0
  fi

  rm -rf "$API_DIR/node_modules" "$DASHBOARD_DIR/node_modules"
  install_dependencies
}

reset_database() {
  ensure_package_manager || return 1
  if ! confirm "Isso vai resetar o banco local do Prisma. Continuar?"; then
    warn "Operacao cancelada."
    return 0
  fi

  case "$PACKAGE_MANAGER" in
    pnpm) (cd "$API_DIR" && pnpm exec prisma migrate reset --force) ;;
    yarn) (cd "$API_DIR" && yarn prisma migrate reset --force) ;;
    bun) (cd "$API_DIR" && bunx prisma migrate reset --force) ;;
    npm) (cd "$API_DIR" && npx prisma migrate reset --force) ;;
  esac
}

recreate_docker_environment() {
  ensure_compose || return 1
  if ! confirm "Isso vai recriar containers e volumes do compose. Continuar?"; then
    warn "Operacao cancelada."
    return 0
  fi

  docker compose -f "$COMPOSE_FILE" down -v
  docker compose -f "$COMPOSE_FILE" up -d "$POSTGRES_SERVICE"
  if [[ -n "$REDIS_SERVICE" ]]; then
    warn "Redis e opcional. Use a opcao dedicada se quiser subi-lo tambem."
  fi
}

detect_container_shell() {
  local service="$1"
  for shell_name in bash sh ash; do
    if docker compose -f "$COMPOSE_FILE" exec "$service" "$shell_name" -lc "exit" >/dev/null 2>&1; then
      printf "%s" "$shell_name"
      return 0
    fi
  done
  return 1
}

open_container_shell_menu() {
  ensure_compose || return 1

  local services=()
  while IFS= read -r service; do
    [[ -n "$service" ]] && services+=("$service")
  done < <(docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null)

  if [[ "${#services[@]}" -eq 0 ]]; then
    warn "Nenhum servico detectado no compose."
    return 0
  fi

  printf "%b\n" "${BOLD}Shell dos containers${NC}"
  local index=1
  local service=""
  for service in "${services[@]}"; do
    printf "%2d. %s\n" "$index" "$service"
    index=$((index + 1))
  done
  printf " 0. Voltar\n\n"

  local choice=""
  read -r -p "Escolha um servico: " choice
  if [[ "$choice" == "0" ]]; then
    return 0
  fi
  if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#services[@]} )); then
    error "Opcao invalida."
    return 1
  fi

  service="${services[$((choice - 1))]}"
  ensure_service_running "$service" || return 1

  printf "%b\n" "${BOLD}Diagnostico do container${NC}"
  docker compose -f "$COMPOSE_FILE" ps "$service"
  printf "\n"

  local shell_name
  shell_name="$(detect_container_shell "$service")" || {
    error "Nao foi possivel detectar shell compativel para $service."
    return 1
  }

  info "Abrindo shell '$shell_name' no servico $service..."
  docker compose -f "$COMPOSE_FILE" exec "$service" "$shell_name"
}

show_menu() {
  print_header
  printf "%b\n" "${BOLD}Ambiente${NC}"
  printf " 1. Instalar dependencias\n"
  printf " 2. Subir infraestrutura base (Postgres)\n"
  printf " 3. Subir infraestrutura com Redis opcional\n"
  printf " 4. Iniciar monolito local (API + dashboard)\n"
  printf " 5. Parar monolito local (API + dashboard)\n"
  printf " 6. Ver status geral\n"
  printf "\n"
  printf "%b\n" "${BOLD}Banco e dados${NC}"
  printf " 7. Prisma generate\n"
  printf " 8. Prisma migrate dev\n"
  printf " 9. Prisma Studio\n"
  printf "10. Shell do container Postgres\n"
  printf "11. Console SQL do Postgres\n"
  if [[ -n "$REDIS_SERVICE" ]]; then
    printf "12. Redis CLI\n"
    printf "13. Limpar Redis\n"
  fi
  printf "\n"
  printf "%b\n" "${BOLD}Desenvolvimento e qualidade${NC}"
  printf "14. Rodar checks da API\n"
  printf "15. Rodar checks do dashboard\n"
  printf "16. Secret scan\n"
  printf "17. Smoke test Google Drive\n"
  printf "\n"
  printf "%b\n" "${BOLD}Logs e diagnostico${NC}"
  printf "18. Logs do docker compose\n"
  printf "19. Logs locais do manager\n"
  printf "20. Health check da API\n"
  printf "21. Diagnostico de portas\n"
  printf "22. Shell dos containers\n"
  printf "\n"
  printf "%b\n" "${BOLD}Reset e manutencao${NC}"
  printf "23. Limpar artefatos de build\n"
  printf "24. Reinstalar dependencias\n"
  printf "25. Resetar banco Prisma\n"
  printf "26. Recriar ambiente Docker\n"
  printf "27. Parar compose\n"
  printf "\n"
  printf " 0. Sair\n\n"
}

main_loop() {
  detect_stack

  while true; do
    show_menu
    local option=""
    read -r -p "Escolha uma opcao: " option
    printf "\n"

    case "$option" in
      1) install_dependencies ;;
      2) compose_up_base ;;
      3) compose_up_with_redis ;;
      4) start_monolith ;;
      5) stop_monolith ;;
      6) show_status ;;
      7) run_prisma_generate ;;
      8) run_prisma_migrate ;;
      9) run_prisma_studio ;;
      10) open_postgres_shell ;;
      11) open_postgres_sql ;;
      12) if [[ -n "$REDIS_SERVICE" ]]; then open_redis_cli; else warn "Opcao indisponivel."; fi ;;
      13) if [[ -n "$REDIS_SERVICE" ]]; then flush_redis; else warn "Opcao indisponivel."; fi ;;
      14) run_api_checks ;;
      15) run_dashboard_checks ;;
      16) run_secret_scan ;;
      17) run_smoke_test ;;
      18) compose_logs ;;
      19) tail_manager_logs ;;
      20) health_check_api ;;
      21) show_port_diagnostics ;;
      22) open_container_shell_menu ;;
      23) cleanup_build_artifacts ;;
      24) reinstall_dependencies ;;
      25) reset_database ;;
      26) recreate_docker_environment ;;
      27) compose_stop_all ;;
      0) break ;;
      *) error "Opcao invalida." ;;
    esac

    pause
  done
}

main_loop "$@"
