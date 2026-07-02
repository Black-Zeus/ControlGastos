#!/bin/bash

# ==================================================
# Docker Tools - Versión Mejorada
# Enfoque: Robustez, Refactorización y UX/UI
# ==================================================

# ==================================================
# CONFIGURACIÓN Y CONSTANTES (Punto 4: UX/UI - Colores)
# ==================================================

# Configuración de colores mejorada con tput (compatible)
setup_colors() {
    if [[ -t 1 ]]; then  # Verifica si es terminal interactiva
        if command -v tput &> /dev/null; then
            RED=$(tput setaf 1)
            GREEN=$(tput setaf 2)
            YELLOW=$(tput setaf 3)
            BLUE=$(tput setaf 4)
            MAGENTA=$(tput setaf 5)
            CYAN=$(tput setaf 6)
            WHITE=$(tput setaf 7)
            BOLD=$(tput bold)
            NC=$(tput sgr0) # No Color
        else
            # Fallback a códigos ANSI si tput no está disponible
            RED='\033[0;31m'
            GREEN='\033[0;32m'
            YELLOW='\033[1;33m'
            BLUE='\033[0;34m'
            MAGENTA='\033[0;35m'
            CYAN='\033[0;36m'
            WHITE='\033[0;37m'
            BOLD='\033[1m'
            NC='\033[0m'
        fi
    else
        RED=""; GREEN=""; YELLOW=""; BLUE=""; MAGENTA=""; CYAN=""; WHITE=""; BOLD=""; NC=""
    fi
    
    # Emojis consistentes para feedback (Punto 4)
    ICON_SUCCESS="✅"
    ICON_ERROR="❌"
    ICON_WARNING="⚠️"
    ICON_INFO="ℹ️"
    ICON_QUESTION="👉"
    ICON_CONTAINER="📦"
    ICON_DOCKER="🐳"
    ICON_MENU="📋"
    ICON_SETTINGS="⚙️"
}

# ==================================================
# FUNCIONES ORIGINALES NECESARIAS
# ==================================================

# Función para leer PROJECT_NAME desde .env
read_project_name() {
    local env_file=".env"
    
    if [[ -f "$env_file" ]]; then
        local project_line=$(grep "^PROJECT_NAME=" "$env_file" 2>/dev/null)
        if [[ -n "$project_line" ]]; then
            echo "$project_line" | cut -d'=' -f2 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^"//;s/"$//'
        else
            echo ""
        fi
    else
        echo ""
    fi
}

# Función para definir archivo compose según entorno
define_compose_file() {
    case "$ENV" in
        "dev")
            COMPOSE_FILE="docker-compose-dev.yml"
            ;;
        "qa")
            COMPOSE_FILE="docker-compose-qa.yml"
            ;;
        "prd")
            COMPOSE_FILE="docker-compose.yml"
            ;;
        *)
            echo "Entorno no válido. Se usará el archivo por defecto: docker-compose-dev.yml"
            COMPOSE_FILE="docker-compose-dev.yml"
            ;;
    esac
}

read_env_value() {
    local key="$1"
    local default_value="${2:-}"
    local value=""
    local env_files=(".env" ".env.$ENV")

    for env_file in "${env_files[@]}"; do
        if [[ -f "$env_file" ]]; then
            local line
            line=$(grep -E "^${key}=" "$env_file" 2>/dev/null | tail -n 1)
            if [[ -n "$line" ]]; then
                value=$(echo "$line" | cut -d'=' -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^"//;s/"$//')
            fi
        fi
    done

    if [[ -n "$value" ]]; then
        echo "$value"
    else
        echo "$default_value"
    fi
}

get_runtime_data_root() {
    read_env_value "DATA_ROOT" "./APP/data/${ENV}"
}

get_runtime_logs_root() {
    read_env_value "LOGS_ROOT" "./APP/logs/${ENV}"
}

get_runtime_volumes_root() {
    read_env_value "VOLUMES_ROOT" "./APP/volumes"
}

build_compose_cmd() {
    local action="$1"
    local profile_args="${2:-}"
    local service_args="${3:-}"
    echo "$COMPOSE_CMD -f $COMPOSE_FILE --env-file .env --env-file .env.$ENV ${profile_args} ${action} ${service_args}"
}

get_service_block_from_compose() {
    local compose_file="$1"
    local service_name="$2"

    awk -v target="$service_name" '
        BEGIN {
            in_services = 0
            in_target = 0
        }
        /^services:/ {
            in_services = 1
            next
        }
        in_services && /^[^[:space:]]/ {
            if ($0 !~ /^services:/) {
                if (in_target) {
                    exit
                }
                in_services = 0
            }
        }
        in_services && $0 ~ ("^  " target ":$") {
            in_target = 1
            print
            next
        }
        in_target && /^  [a-zA-Z0-9_-]+:/ {
            exit
        }
        in_target {
            print
        }
    ' "$compose_file"
}

list_services_by_group() {
    local target_group="${1:-all}"
    local services=()
    local service_name=""
    local service_block=""
    local group_value=""

    while IFS= read -r service_name; do
        [[ -z "$service_name" ]] && continue
        service_block="$(get_service_block_from_compose "$COMPOSE_FILE" "$service_name")"
        group_value="$(echo "$service_block" | sed -n 's/^[[:space:]]*service\.group: //p' | head -1)"

        if [[ "$target_group" == "all" || "$group_value" == "$target_group" ]]; then
            services+=("$service_name")
        fi
    done < <(eval "$(build_compose_cmd "config --services" "--profile tools")" 2>/dev/null)

    if [[ ${#services[@]} -gt 0 ]]; then
        printf '%s\n' "${services[@]}"
    fi
}

print_grouped_services_summary() {
    local group_name=""
    local group_label=""
    local has_any=0
    local service_name=""

    for group_name in core dependency tools; do
        case "$group_name" in
            dependency) group_label="Dependencies" ;;
            core)       group_label="Core" ;;
            tools)      group_label="Tools" ;;
            *)          group_label="$group_name" ;;
        esac

        if list_services_by_group "$group_name" >/dev/null 2>&1; then
            has_any=1
            echo -e "${CYAN}   ${group_label}:${NC}"
            while IFS= read -r service_name; do
                [[ -z "$service_name" ]] && continue
                echo -e "   • ${service_name}"
            done < <(list_services_by_group "$group_name")
            echo ""
        fi
    done

    if [[ "$has_any" -eq 0 ]]; then
        echo -e "${YELLOW}   (sin servicios detectados)${NC}"
    fi
}

validate_compose_env_files() {
    local missing_files=()
    local env_file=""

    for env_file in ".env" ".env.$ENV"; do
        if [[ ! -f "$env_file" ]]; then
            missing_files+=("$env_file")
        fi
    done

    if [[ ${#missing_files[@]} -gt 0 ]]; then
        echo -e "${RED}${BOLD}❌ Faltan archivos de entorno requeridos:${NC}"
        for env_file in "${missing_files[@]}"; do
            echo -e "${RED}   └─ ${env_file}${NC}"
        done
        echo ""
        echo -e "${YELLOW}Cree los archivos locales a partir de .env.example y luego genere .env.${ENV} solo con overrides del entorno.${NC}"
        return 1
    fi

    local required_vars=()
    while IFS= read -r var_name; do
        [[ -n "$var_name" ]] && required_vars+=("$var_name")
    done < <(grep -oE '\$\{[A-Z0-9_]+(:-[^}]*)?\}' "$COMPOSE_FILE" 2>/dev/null | sed -E 's/^\$\{([A-Z0-9_]+).*/\1/' | sort -u)

    local missing_vars=()
    local optional_empty_vars=()
    local var_name=""
    for var_name in "${required_vars[@]}"; do
        if [[ " ${optional_empty_vars[*]} " == *" ${var_name} "* ]]; then
            continue
        fi
        if [[ -z "$(read_env_value "$var_name")" ]]; then
            missing_vars+=("$var_name")
        fi
    done

    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        echo -e "${RED}${BOLD}❌ Hay variables requeridas sin valor para ${COMPOSE_FILE}:${NC}"
        for var_name in "${missing_vars[@]}"; do
            echo -e "${RED}   └─ ${var_name}${NC}"
        done
        echo ""
        echo -e "${YELLOW}Revise .env y .env.${ENV} o regenérelos desde los archivos *.example.${NC}"
        return 1
    fi

    return 0
}

ask_service_groups() {
    local response=""
    local core_services=()
    local dependency_services=()
    local tools_services=()
    local selected_services=()
    local service_name=""

    SELECTED_PROFILE_ARGS=""
    SELECTED_SERVICE_ARGS=""

    while IFS= read -r service_name; do
        [[ -n "$service_name" ]] && core_services+=("$service_name")
    done < <(list_services_by_group "core")

    while IFS= read -r service_name; do
        [[ -n "$service_name" ]] && dependency_services+=("$service_name")
    done < <(list_services_by_group "dependency")

    while IFS= read -r service_name; do
        [[ -n "$service_name" ]] && tools_services+=("$service_name")
    done < <(list_services_by_group "tools")

    selected_services=("${core_services[@]}")

    echo ""
    echo -e "${CYAN}${BOLD}🧩 ALCANCE DEL LEVANTE${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "El grupo base para el entorno ${BOLD}${ENV}${NC} sera siempre ${BOLD}core${NC}."
    echo ""
    if [[ ${#dependency_services[@]} -gt 0 ]]; then
        echo -e "Dependencias disponibles:"
        for service_name in "${dependency_services[@]}"; do
            echo -e "   • ${service_name}"
        done
        echo ""
        read -p "$(echo -e ${CYAN}"¿Desea anexar también dependency? [s/N]: "${NC})" response
        if [[ "$response" =~ ^[Ss]$ ]]; then
            selected_services+=("${dependency_services[@]}")
        fi
    fi

    if [[ ${#tools_services[@]} -gt 0 ]]; then
        echo ""
        echo -e "Herramientas disponibles:"
        for service_name in "${tools_services[@]}"; do
            echo -e "   • ${service_name}"
        done
        echo ""
        read -p "$(echo -e ${CYAN}"¿Desea anexar también tools? [s/N]: "${NC})" response
        if [[ "$response" =~ ^[Ss]$ ]]; then
            SELECTED_PROFILE_ARGS="--profile tools"
            selected_services+=("${tools_services[@]}")
        fi
    fi

    echo ""
    echo -e "${YELLOW}Nota:${NC} Docker Compose puede iniciar dependencias tecnicas adicionales cuando corresponda."

    if [[ ${#selected_services[@]} -gt 0 ]]; then
        SELECTED_SERVICE_ARGS="${selected_services[*]}"
    fi
}

remove_directory_contents() {
    local target_dir="$1"
    local label="$2"

    if [[ ! -d "$target_dir" ]]; then
        echo -e "${YELLOW}⚠️  No existe el directorio ${target_dir}${NC}"
        return 0
    fi

    local found=false
    shopt -s dotglob nullglob
    for item in "$target_dir"/*; do
        local base_name
        base_name=$(basename "$item")

        if [[ "$base_name" == ".gitkeep" ]]; then
            continue
        fi

        found=true
        rm -rf "$item" 2>/dev/null && \
            echo -e "${GREEN}✅ Eliminado: $item${NC}" || \
            echo -e "${RED}❌ Error al eliminar $item${NC}"
    done
    shopt -u dotglob nullglob

    if [[ "$found" == false ]]; then
        echo -e "${YELLOW}⚠️  ${label} ya está vacío${NC}"
    fi
}

clean_runtime_artifacts() {
    local volumes_root
    volumes_root="$(get_runtime_volumes_root)"

    echo -e "${BLUE}Buscando artefactos de runtime en ${volumes_root}...${NC}"

    if [[ ! -d "$volumes_root" ]]; then
        echo -e "${YELLOW}⚠️  No existe el directorio ${volumes_root}${NC}"
        return 0
    fi

    local targets=(
        "node_modules"
        "__pycache__"
        ".pytest_cache"
        ".mypy_cache"
        ".ruff_cache"
        ".venv"
        "venv"
        "dist"
        "build"
        "coverage"
    )

    local removed_any=false
    local target_name=""
    for target_name in "${targets[@]}"; do
        while IFS= read -r matched_path; do
            [[ -z "$matched_path" ]] && continue
            removed_any=true
            rm -rf "$matched_path" 2>/dev/null && \
                echo -e "${GREEN}✅ Eliminado: $matched_path${NC}" || \
                echo -e "${RED}❌ Error al eliminar $matched_path${NC}"
        done < <(find "$volumes_root" -path "*/.git/*" -prune -o -name "$target_name" -print 2>/dev/null)
    done

    while IFS= read -r matched_file; do
        [[ -z "$matched_file" ]] && continue
        removed_any=true
        rm -f "$matched_file" 2>/dev/null && \
            echo -e "${GREEN}✅ Eliminado: $matched_file${NC}" || \
            echo -e "${RED}❌ Error al eliminar $matched_file${NC}"
    done < <(find "$volumes_root" -path "*/.git/*" -prune -o \( -name "*.pyc" -o -name "*.pyo" \) -print 2>/dev/null)

    if [[ "$removed_any" == false ]]; then
        echo -e "${YELLOW}⚠️  No se encontraron artefactos de runtime para limpiar${NC}"
    fi
}

list_project_named_volumes() {
    docker volume ls --format "{{.Name}}" 2>/dev/null | grep -E "^${PROJECT_NAME}_" || true
}

get_volume_name_from_backup() {
    local backup_filename="$1"
    local base_name=""

    base_name="${backup_filename%.tar.gz}"
    base_name="${base_name%_[0-9][0-9][0-9][0-9][0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9]}"
    echo "$base_name"
}

ensure_path_writable() {
    local target_dir="$1"
    local label="$2"
    local current_user current_group

    if [[ ! -d "$target_dir" ]]; then
        return 0
    fi

    current_user="$(id -un 2>/dev/null)"
    current_group="$(id -gn 2>/dev/null)"

    if [[ -z "$current_user" || -z "$current_group" ]]; then
        echo -e "${YELLOW}⚠️  No se pudo determinar el usuario actual para ajustar permisos en ${label}${NC}"
        return 1
    fi

    if chown -R "$current_user:$current_group" "$target_dir" 2>/dev/null; then
        echo -e "${GREEN}✅ Permisos actualizados: ${target_dir}${NC}"
        return 0
    fi

    if command -v sudo >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  ${label} requiere privilegios para corregir ownership. Se intentará con sudo.${NC}"
        if sudo chown -R "$current_user:$current_group" "$target_dir"; then
            echo -e "${GREEN}✅ Permisos actualizados con sudo: ${target_dir}${NC}"
            return 0
        fi
    fi

    echo -e "${RED}❌ No se pudieron corregir permisos en ${target_dir}${NC}"
    echo -e "${YELLOW}   └─ Si hay archivos creados por root dentro de bind mounts, la limpieza puede fallar sobre esos paths.${NC}"
    return 1
}

# Función para obtener IP actual (versión simplificada)
get_current_ip() {
    local ip=""
    
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || -n "$MSYSTEM" ]]; then
        if command -v ipconfig &> /dev/null; then
            ip=$(ipconfig 2>/dev/null | grep -a "IPv4" | grep -v "127.0.0.1" | head -1 | sed 's/.*: //' | tr -d '\r')
        fi
    else
        if command -v ip &> /dev/null; then
            ip=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}')
        fi
        if [[ -z "$ip" ]] && command -v hostname &> /dev/null; then
            ip=$(hostname -I 2>/dev/null | awk '{print $1}')
        fi
    fi
    
    echo "$ip"
}

# Función para pausar
pause() {
    echo ""
    read -p "$(echo -e ${CYAN}"Presione Enter para continuar..."${NC})"
}

# ==================================================
# VERIFICACIÓN DE DEPENDENCIAS (Punto 1: Robustez)
# ==================================================

# Verificar dependencias críticas
check_dependencies() {
    local missing_deps=()
    local has_errors=false
    
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}🔍 VERIFICANDO DEPENDENCIAS DEL SISTEMA${NC}"
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Verificar Docker CLI
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
        has_errors=true
    else
        echo -e "${GREEN}✅ Docker CLI: Encontrado${NC}"
        
        # Verificar que Docker daemon esté corriendo
        if ! docker info &> /dev/null; then
            echo -e "${RED}❌ Docker daemon: No está en ejecución${NC}"
            echo -e "${YELLOW}   └─ Solución: Inicie Docker Desktop o el servicio Docker${NC}"
            has_errors=true
        else
            echo -e "${GREEN}✅ Docker daemon: En ejecución${NC}"
        fi
    fi
    
    # Verificar Docker Compose (plugin o standalone)
    if docker compose version &> /dev/null; then
        echo -e "${GREEN}✅ Docker Compose (plugin): Encontrado${NC}"
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &> /dev/null; then
        echo -e "${GREEN}✅ Docker Compose (standalone): Encontrado${NC}"
        COMPOSE_CMD="docker-compose"
    else
        missing_deps+=("docker-compose")
        has_errors=true
    fi
    
    # Verificar comandos esenciales de Unix
    local essential_commands=("grep" "cut" "sed" "awk")
    for cmd in "${essential_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_deps+=("$cmd")
            has_errors=true
        else
            echo -e "${GREEN}✅ $cmd: Encontrado${NC}"
        fi
    done
    
    echo ""
    
    # Mostrar resultados de verificación
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        echo -e "${RED}${BOLD}❌ ERROR: Dependencias críticas faltantes:${NC}"
        for dep in "${missing_deps[@]}"; do
            echo -e "${RED}   └─ $dep${NC}"
        done
        echo ""
        echo -e "${YELLOW}💡 Instale las dependencias faltantes e intente nuevamente.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}${BOLD}✅ Verificación de dependencias completada exitosamente${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    sleep 2
}

# ==================================================
# FUNCIONES DE UTILIDAD ROBUSTAS (Punto 1)
# ==================================================

# Función segura para sed -i (compatible Linux/macOS)
sed_in_place() {
    local file="$1"
    local pattern="$2"
    local backup_ext=""
    
    # Crear backup automático
    if [[ "$3" == "--backup" ]]; then
        local backup_file="${file}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$file" "$backup_file"
        echo -e "${BLUE}📋 Backup creado: $backup_file${NC}"
    fi
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "$pattern" "$file"
    else
        sed -i "$pattern" "$file"
    fi
    
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        echo -e "${RED}❌ Error al modificar $file${NC}"
        return 1
    fi
    return 0
}

# Ejecutar comando con manejo de errores mejorado
run_cmd() {
    local cmd="$1"
    local error_msg="${2:-Error al ejecutar el comando}"
    local success_msg="${3:-Comando ejecutado exitosamente}"
    local exit_code
    
    echo -e "${CYAN}▶ Ejecutando: $cmd${NC}"
    echo -e "${CYAN}────────────────────────────────────────────────${NC}"
    
    # Ejecutar el comando directamente para ver el output en tiempo real
    eval "$cmd"
    exit_code=$?
    
    echo -e "${CYAN}────────────────────────────────────────────────${NC}"
    
    if [[ $exit_code -ne 0 ]]; then
        echo -e "${RED}❌ $error_msg (código: $exit_code)${NC}"
        return $exit_code
    fi
    
    echo -e "${GREEN}✅ $success_msg${NC}"
    return 0
}

# Verificar existencia de archivo con mensaje claro
check_file_exists() {
    local file="$1"
    local purpose="${2:-operación}"
    
    if [[ ! -f "$file" ]]; then
        echo -e "${RED}❌ Error: Archivo no encontrado: $file${NC}"
        echo -e "${YELLOW}   └─ Necesario para: $purpose${NC}"
        return 1
    fi
    return 0
}

# Verificar que el stack tenga contenedores
check_stack_containers() {
    local count=$(docker ps --filter "label=$LABEL_FILTER" -q 2>/dev/null | wc -l)
    if [[ $count -eq 0 ]]; then
        echo -e "${YELLOW}⚠️  No hay contenedores activos con etiqueta: $LABEL_FILTER${NC}"
        echo -e "${BLUE}   └─ Use la opción 1 del menú principal para iniciarlos${NC}"
        return 1
    fi
    return 0
}

docker_container_exists() {
    local container_name="$1"
    docker ps -a --format '{{.Names}}' 2>/dev/null | grep -Fxq "$container_name"
}

docker_container_is_running() {
    local container_name="$1"
    docker ps --format '{{.Names}}' 2>/dev/null | grep -Fxq "$container_name"
}

get_container_image() {
    local container_name="$1"
    docker inspect --format '{{.Config.Image}}' "$container_name" 2>/dev/null
}

is_portainer_image() {
    local image_name="$1"
    [[ "$image_name" == *"portainer/portainer-ce"* || "$image_name" == *"portainer/portainer-ee"* ]]
}

named_portainer_container_is_valid() {
    if ! docker_container_exists "$PORTAINER_NAME"; then
        return 1
    fi

    is_portainer_image "$(get_container_image "$PORTAINER_NAME")"
}

warn_invalid_named_portainer_container() {
    local image_name=""

    if ! docker_container_exists "$PORTAINER_NAME"; then
        return 1
    fi

    image_name="$(get_container_image "$PORTAINER_NAME")"
    echo -e "${RED}❌ Existe un contenedor llamado ${PORTAINER_NAME}, pero su imagen es ${image_name:-desconocida} y no corresponde a Portainer.${NC}"
    echo -e "${YELLOW}   └─ Renómbrelo o elimínelo manualmente antes de administrar Portainer desde este menú.${NC}"
    return 0
}

get_container_host_port() {
    local container_name="$1"
    local container_port="${2:-$PORTAINER_CONTAINER_PORT}"
    docker inspect --format "{{with index .HostConfig.PortBindings \"$container_port\"}}{{(index . 0).HostPort}}{{end}}" "$container_name" 2>/dev/null
}

get_running_container_using_host_port() {
    local host_port="$1"
    docker ps --filter "publish=$host_port" --format '{{.Names}}' 2>/dev/null | head -n 1
}

is_local_process_using_host_port() {
    local host_port="$1"

    if command -v ss >/dev/null 2>&1; then
        ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$host_port$"
        return $?
    fi

    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$host_port" -sTCP:LISTEN >/dev/null 2>&1
        return $?
    fi

    if command -v netstat >/dev/null 2>&1; then
        netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$host_port$"
        return $?
    fi

    return 1
}

is_host_port_occupied() {
    local host_port="$1"
    local ignore_container="${2:-}"
    local container_using_port=""

    container_using_port="$(get_running_container_using_host_port "$host_port")"
    if [[ -n "$container_using_port" && "$container_using_port" != "$ignore_container" ]]; then
        return 0
    fi

    if is_local_process_using_host_port "$host_port"; then
        if [[ -n "$ignore_container" ]] && docker_container_is_running "$ignore_container"; then
            local ignore_port=""
            ignore_port="$(get_container_host_port "$ignore_container")"
            if [[ "$ignore_port" == "$host_port" ]]; then
                return 1
            fi
        fi
        return 0
    fi

    return 1
}

describe_host_port_usage() {
    local host_port="$1"
    local ignore_container="${2:-}"
    local container_using_port=""
    local container_image=""

    container_using_port="$(get_running_container_using_host_port "$host_port")"
    if [[ -n "$container_using_port" && "$container_using_port" != "$ignore_container" ]]; then
        container_image="$(get_container_image "$container_using_port")"
        if is_portainer_image "$container_image"; then
            echo "otro contenedor de Portainer (${container_using_port})"
        else
            echo "el contenedor ${container_using_port} (${container_image})"
        fi
        return 0
    fi

    if is_local_process_using_host_port "$host_port"; then
        echo "otro proceso local"
        return 0
    fi

    echo ""
}

find_available_host_port() {
    local starting_port="${1:-$PORTAINER_DEFAULT_HOST_PORT}"
    local max_attempts=200
    local candidate_port="$starting_port"
    local attempt=0

    while (( attempt < max_attempts )); do
        if ! is_host_port_occupied "$candidate_port"; then
            echo "$candidate_port"
            return 0
        fi
        ((candidate_port++))
        ((attempt++))
    done

    return 1
}

prompt_portainer_host_port() {
    local suggested_port="$1"
    local ignore_container="${2:-}"
    local selected_port=""
    local port_usage=""

    while true; do
        read -p "$(echo -e ${CYAN}"Puerto para publicar Portainer [${suggested_port}]: "${NC})" selected_port
        selected_port="${selected_port:-$suggested_port}"

        if ! [[ "$selected_port" =~ ^[0-9]+$ ]] || (( selected_port < 1 || selected_port > 65535 )); then
            echo -e "${RED}❌ Puerto inválido. Debe ser un número entre 1 y 65535.${NC}" >&2
            continue
        fi

        if is_host_port_occupied "$selected_port" "$ignore_container"; then
            port_usage="$(describe_host_port_usage "$selected_port" "$ignore_container")"
            echo -e "${RED}❌ El puerto ${selected_port} ya está en uso por ${port_usage:-otro servicio}.${NC}" >&2
            continue
        fi

        echo "$selected_port"
        return 0
    done
}

create_portainer_container() {
    local host_port="$1"
    docker volume create portainer_data >/dev/null 2>&1 || true
    docker run -d \
        --name "$PORTAINER_NAME" \
        --restart unless-stopped \
        -p "${host_port}:9000" \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v portainer_data:/data \
        "$PORTAINER_IMAGE" >/dev/null 2>&1
}

recreate_portainer_container() {
    local host_port="$1"

    docker stop "$PORTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$PORTAINER_NAME" >/dev/null 2>&1 || true

    create_portainer_container "$host_port"
}

get_portainer_url() {
    local host_port=""

    if docker_container_exists "$PORTAINER_NAME"; then
        host_port="$(get_container_host_port "$PORTAINER_NAME")"
    fi

    host_port="${host_port:-$PORTAINER_DEFAULT_HOST_PORT}"
    echo "http://localhost:${host_port}"
}

ensure_portainer_host_port() {
    local desired_port="${1:-$PORTAINER_DEFAULT_HOST_PORT}"
    local ignore_container="${2:-}"
    local port_usage=""
    local suggested_port=""

    if ! is_host_port_occupied "$desired_port" "$ignore_container"; then
        echo "$desired_port"
        return 0
    fi

    port_usage="$(describe_host_port_usage "$desired_port" "$ignore_container")"
    suggested_port="$(find_available_host_port $((desired_port + 1)))"

    echo -e "${YELLOW}⚠️  El puerto ${desired_port} ya está en uso por ${port_usage:-otro servicio}.${NC}" >&2
    if [[ -n "$suggested_port" ]]; then
        echo -e "${BLUE}💡 Sugerencia: usar el puerto ${suggested_port}.${NC}" >&2
        prompt_portainer_host_port "$suggested_port" "$ignore_container"
        return 0
    fi

    echo -e "${RED}❌ No se encontró un puerto disponible cercano para Portainer.${NC}" >&2
    return 1
}

start_portainer() {
    local current_port=""
    local resolved_port=""
    local port_usage=""

    if docker_container_exists "$PORTAINER_NAME"; then
        if ! named_portainer_container_is_valid; then
            warn_invalid_named_portainer_container
            return 1
        fi

        current_port="$(get_container_host_port "$PORTAINER_NAME")"
        current_port="${current_port:-$PORTAINER_DEFAULT_HOST_PORT}"

        if docker_container_is_running "$PORTAINER_NAME"; then
            echo -e "${GREEN}✅ Portainer ya está en ejecución en $(get_portainer_url)${NC}"
            return 0
        fi

        if is_host_port_occupied "$current_port" "$PORTAINER_NAME"; then
            port_usage="$(describe_host_port_usage "$current_port" "$PORTAINER_NAME")"
            echo -e "${YELLOW}⚠️  El contenedor ${PORTAINER_NAME} existe, pero no puede iniciar porque su puerto ${current_port} está ocupado por ${port_usage:-otro servicio}.${NC}"
            resolved_port="$(ensure_portainer_host_port "$current_port" "$PORTAINER_NAME")" || return 1

            if confirm_action "¿Recrear Portainer para usar el puerto ${resolved_port}?" "si"; then
                if recreate_portainer_container "$resolved_port"; then
                    echo -e "${GREEN}✅ Portainer recreado e iniciado en http://localhost:${resolved_port}${NC}"
                    return 0
                fi
                echo -e "${RED}❌ Error al recrear Portainer${NC}"
                return 1
            fi

            echo -e "${YELLOW}⚠️  Operación cancelada. Portainer no fue recreado.${NC}"
            return 1
        fi

        if docker start "$PORTAINER_NAME" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Portainer iniciado en $(get_portainer_url)${NC}"
            return 0
        fi

        echo -e "${RED}❌ Error al iniciar ${PORTAINER_NAME}. Revise los logs para más detalle.${NC}"
        return 1
    fi

    resolved_port="$(ensure_portainer_host_port "$PORTAINER_DEFAULT_HOST_PORT")" || return 1
    if create_portainer_container "$resolved_port"; then
        echo -e "${GREEN}✅ Portainer iniciado en http://localhost:${resolved_port}${NC}"
        return 0
    fi

    echo -e "${RED}❌ Error al iniciar Portainer${NC}"
    return 1
}

# ==================================================
# FUNCIONES REFACTORIZADAS (Punto 2)
# ==================================================

# Función unificada para listar contenedores del stack
list_stack_containers() {
    local format="${1:-simple}"
    local include_all="${2:-false}"
    local containers=()
    local docker_cmd="docker ps"
    
    if [[ "$include_all" == "true" ]]; then
        docker_cmd="docker ps -a"
    fi
    
    # Usar delimitador seguro (|) para evitar problemas con espacios
    while IFS= read -r line; do
        [[ -n "$line" ]] && containers+=("$line")
    done < <($docker_cmd --filter "label=$LABEL_FILTER" --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}" 2>/dev/null)
    
    if [[ ${#containers[@]} -eq 0 ]]; then
        echo -e "${YELLOW}⚠️  No se encontraron contenedores con la etiqueta: $LABEL_FILTER${NC}"
        return 1
    fi
    
    echo ""
    case "$format" in
        "simple")
            printf "${BOLD}%-4s %-25s %-15s${NC}\n" "#" "NOMBRE" "ESTADO"
            echo "----------------------------------------------------"
            for i in "${!containers[@]}"; do
                IFS='|' read -r id name image status ports <<< "${containers[$i]}"
                local status_color="${GREEN}"
                [[ "$status" == *"Exited"* ]] && status_color="${RED}"
                [[ "$status" == *"Paused"* ]] && status_color="${YELLOW}"
                printf "%-4d %-25.25s ${status_color}%-15.15s${NC}\n" $((i+1)) "$name" "$status"
            done
            ;;
        "detailed")
            printf "${BOLD}%-4s %-25s %-30s %-15s %-25s${NC}\n" "#" "NOMBRE" "IMAGEN" "ESTADO" "PUERTOS"
            echo "------------------------------------------------------------------------------------------"
            for i in "${!containers[@]}"; do
                IFS='|' read -r id name image status ports <<< "${containers[$i]}"
                local status_color="${GREEN}"
                [[ "$status" == *"Exited"* ]] && status_color="${RED}"
                [[ "$status" == *"Paused"* ]] && status_color="${YELLOW}"
                printf "%-4d %-25.25s %-30.30s ${status_color}%-15.15s${NC} %-25.25s\n" $((i+1)) "$name" "$image" "$status" "$ports"
            done
            ;;
    esac
    
    # Guardar en variable global para uso posterior
    STACK_CONTAINERS=("${containers[@]}")
    STACK_CONTAINER_COUNT=${#containers[@]}
    return 0
}

# Función unificada para seleccionar un contenedor del stack
select_container_from_stack() {
    local prompt="${1:-Seleccione el número del contenedor}"
    local allow_exit="${2:-true}"
    local show_all="${3:-false}"
    local selected_id=""
    local selected_name=""
    local selected_index=""
    
    echo -e "\n${CYAN}${BOLD}📋 CONTENEDORES DISPONIBLES:${NC}"
    
    if ! list_stack_containers "detailed" "$show_all"; then
        return 1
    fi
    
    local exit_index=$(( STACK_CONTAINER_COUNT + 1 ))
    echo ""
    
    if [[ "$allow_exit" == "true" ]]; then
        echo -e "${YELLOW}${exit_index}) ⬅️ Volver al menú anterior${NC}"
    fi
    
    echo ""
    read -p "$(echo -e ${CYAN}"$prompt: "${NC})" index
    
    if [[ "$allow_exit" == "true" ]] && [[ "$index" == "$exit_index" || "$index" == "0" ]]; then
        return 2  # Código especial para volver
    fi
    
    if ! [[ "$index" =~ ^[0-9]+$ ]] || [[ "$index" -lt 1 ]] || [[ "$index" -gt $STACK_CONTAINER_COUNT ]]; then
        echo -e "${RED}❌ Índice inválido. Debe ser un número entre 1 y $STACK_CONTAINER_COUNT${NC}"
        sleep 2
        return 1
    fi
    
    IFS='|' read -r selected_id selected_name _ <<< "${STACK_CONTAINERS[$((index-1))]}"
    
    # Retornar valores usando variables globales
    SELECTED_CONTAINER_ID="$selected_id"
    SELECTED_CONTAINER_NAME="$selected_name"
    
    echo -e "${GREEN}✅ Seleccionado: $selected_name${NC}"
    return 0
}

# Función para confirmar acciones destructivas (Punto 4 - UX)
confirm_action() {
    local message="$1"
    local default="${2:-no}"
    local response
    
    echo ""
    echo -e "${YELLOW}${BOLD}⚠️  CONFIRMACIÓN REQUERIDA${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}$message${NC}"
    echo ""
    
    if [[ "$default" == "si" ]]; then
        read -p "$(echo -e ${CYAN}"¿Continuar? [S/n]: "${NC})" response
        response=${response:-S}
    else
        read -p "$(echo -e ${CYAN}"¿Continuar? [s/N]: "${NC})" response
        response=${response:-N}
    fi
    
    if [[ "$response" =~ ^[Ss]$ ]]; then
        echo -e "${BLUE}⏳ Procediendo...${NC}"
        return 0
    else
        echo -e "${BLUE}⏭️  Operación cancelada${NC}"
        return 1
    fi
}

# ==================================================
# BANNER MEJORADO CON COLORES (Punto 4 - UX)
# ==================================================

banner_principal() {
    local title="$1"
    clear
    
    echo -e "${CYAN}${BOLD}╔═══════════════════════════════════════════════════════════╗${NC}"
    printf "${CYAN}${BOLD}║              DOCKER TOOLS - %-25s║${NC}\n" "$title"
    echo -e "${CYAN}${BOLD}╚═══════════════════════════════════════════════════════════╝${NC}"
    
    # Mostrar información del entorno con colores
    local current_ip=""
    if [[ -n "$CURRENT_IP" ]]; then
        current_ip="$CURRENT_IP"
    else
        current_ip=$(get_current_ip 2>/dev/null || echo "No detectada")
    fi
    
    local git_info=""
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        git_info="${GREEN}$(git rev-parse --abbrev-ref HEAD 2>/dev/null)${NC}"
    else
        git_info="${YELLOW}No es repositorio Git${NC}"
    fi
    
    echo -e "${BLUE}${BOLD}📋 INFORMACIÓN DEL ENTORNO:${NC}"
    echo -e "   ${CYAN}Archivo:${NC} $COMPOSE_FILE"
    echo -e "   ${CYAN}Stack:${NC} $STACK"
    echo -e "   ${CYAN}Entorno:${NC} $(get_env_color)"
    echo -e "   ${CYAN}IP Actual:${NC} $current_ip"
    echo -e "   ${CYAN}Rama Git:${NC} $git_info"
    echo ""
}

get_env_color() {
    case "$ENV" in
        "dev")  echo -e "${GREEN}dev${NC}" ;;
        "qa")   echo -e "${YELLOW}qa${NC}" ;;
        "prd")  echo -e "${RED}prd${NC}" ;;
        *)      echo -e "$ENV" ;;
    esac
}

# ==================================================
# FUNCIONES DE MENÚ (Punto 2)
# ==================================================

# Menú principal
menu() {
    banner_principal "MENÚ PRINCIPAL"
    
    echo -e "${BOLD}OPCIONES DISPONIBLES:${NC}"
    echo ""
    echo -e "  ${CYAN}1)${NC} ${ICON_CONTAINER} MANEJADOR DE CONTENEDORES"
    echo -e "  ${CYAN}2)${NC} 📊 MONITOREO Y DIAGNÓSTICO"
    echo -e "  ${CYAN}3)${NC} 🧹 LIMPIEZA Y MANTENIMIENTO"
    echo -e "  ${CYAN}4)${NC} ${ICON_SETTINGS} CONFIGURACIÓN DEL SISTEMA"
    echo -e "  ${CYAN}5)${NC} 📱 HERRAMIENTAS EXPO"
    echo -e "  ${CYAN}6)${NC} 📄 GESTIÓN DE TEMPLATES .ENV"
    echo -e "  ${CYAN}7)${NC} ${ICON_DOCKER} ESTADO Y SERVICIOS DOCKER"
    echo -e "  ${CYAN}8)${NC} 🧰 PORTAINER"
    echo -e "  ${CYAN}9)${NC} 💾 BACKUP Y RESTORE"
    echo ""
    echo -e "  ${CYAN}S)${NC} 🚪 Salir"
    echo ""
    
    read -p "$(echo -e ${CYAN}"👉 Seleccione una opción: "${NC})" choice
    
    case "$choice" in
        1) menu_contenedores ;;
        2) menu_monitoreo ;;
        3) menu_limpieza ;;
        4) menu_configuracion ;;
        5) menu_expo ;;
        6) menu_templates ;;
        7) menu_docker_services ;;
        8) menu_portainer ;;
        9) menu_backup ;;
        [Ss]) exit_script ;;
        *)
            echo -e "${RED}❌ Opción inválida${NC}"
            sleep 2
            menu
            ;;
    esac
}

# Menú de contenedores
menu_contenedores() {
    banner_principal "MANEJADOR DE CONTENEDORES"
    
    echo -e "${BOLD}OPCIONES DISPONIBLES:${NC}"
    echo ""
    echo -e "  ${CYAN}1)${NC} 🚀 Iniciar contenedores y construir imagenes"
    echo -e "  ${CYAN}2)${NC} 🛑 Detener y eliminar contenedores"
    echo -e "  ${CYAN}3)${NC} 🔄 Reiniciar contenedores"
    echo -e "  ${CYAN}4)${NC} 🔃 Reiniciar contenedor unico"
    echo -e "  ${CYAN}5)${NC} ♻️ Recrear contenedor unico"
    echo -e "  ${CYAN}6)${NC} 🔨 Construir imágenes"
    echo -e "  ${CYAN}7)${NC} 🔍 Validar Docker Compose"
    echo -e "  ${CYAN}8)${NC} 📏 Validar reglas del proyecto"
    echo ""
    echo -e "  ${CYAN}V)${NC} ⬅️ Volver"
    echo -e "  ${CYAN}S)${NC} 🚪 Salir"
    echo ""
    
    read -p "$(echo -e ${CYAN}"👉 Seleccione una opción: "${NC})" choice
    
    case "$choice" in
        1) up ;;
        2) down ;;
        3) restart ;;
        4) restart_single_container ;;
        5) recreate_single_container ;;
        6) build ;;
        7) validate_compose ;;
        8) validate_compose_rules ;;
        [Vv]) menu ;;
        [Ss]) exit_script ;;
        *)
            echo -e "${RED}❌ Opción inválida${NC}"
            sleep 2
            menu_contenedores
            ;;
    esac
}

# Menú de monitoreo
menu_monitoreo() {
    banner_principal "MONITOREO Y DIAGNÓSTICO"
    
    echo -e "${BOLD}OPCIONES DISPONIBLES:${NC}"
    echo ""
    echo -e "  ${CYAN}1)${NC} 📋 Ver logs"
    echo -e "  ${CYAN}2)${NC} 🔎 Ver logs de un contenedor"
    echo -e "  ${CYAN}3)${NC} 📊 Estado de los contenedores"
    echo -e "  ${CYAN}4)${NC} 📦 Listar contenedores de stack"
    echo -e "  ${CYAN}5)${NC} 💻 Abrir terminal en contenedor"
    echo -e "  ${CYAN}6)${NC} 📈 Monitoreo de recursos"
    echo ""
    echo -e "  ${CYAN}V)${NC} ⬅️ Volver"
    echo -e "  ${CYAN}S)${NC} 🚪 Salir"
    echo ""
    
    read -p "$(echo -e ${CYAN}"👉 Seleccione una opción: "${NC})" choice
    
    case "$choice" in
        1) logs ;;
        2) logs_single_container ;;
        3) ps ;;
        4) list_stack ;;
        5) exec_stack ;;
        6) monitor_resources ;;
        [Vv]) menu ;;
        [Ss]) exit_script ;;
        *)
            echo -e "${RED}❌ Opción inválida${NC}"
            sleep 2
            menu_monitoreo
            ;;
    esac
}

# Menú de limpieza
menu_limpieza() {
    banner_principal "LIMPIEZA Y MANTENIMIENTO"
    
    echo -e "${BOLD}OPCIONES DISPONIBLES:${NC}"
    echo ""
    echo -e "  ${CYAN}1)${NC} 🧹 Limpiar contenedores, redes y volúmenes"
    echo -e "  ${CYAN}2)${NC} 🖼️ Limpiar imágenes no utilizadas"
    echo -e "  ${CYAN}3)${NC} 💾 Limpiar volúmenes no utilizados"
    echo -e "  ${CYAN}4)${NC} 🏗️ Limpiar caché de builds"
    echo -e "  ${CYAN}5)${NC} 🗑️ Limpiar todo"
    echo -e "  ${CYAN}6)${NC} 🔥 Eliminar Persistencias"
    echo ""
    echo -e "  ${CYAN}V)${NC} ⬅️ Volver"
    echo -e "  ${CYAN}S)${NC} 🚪 Salir"
    echo ""
    
    read -p "$(echo -e ${CYAN}"👉 Seleccione una opción: "${NC})" choice
    
    case "$choice" in
        1) clean ;;
        2) clean_images_enhanced ;;
        3) clean_volumes ;;
        4) clean_build_cache ;;
        5) clean_all ;;
        6) drop_persistence ;;
        [Vv]) menu ;;
        [Ss]) exit_script ;;
        *)
            echo -e "${RED}❌ Opción inválida${NC}"
            sleep 2
            menu_limpieza
            ;;
    esac
}

# Menú de configuración
menu_configuracion() {
    banner_principal "CONFIGURACIÓN DEL SISTEMA"
    
    echo -e "${BOLD}OPCIONES DISPONIBLES:${NC}"
    echo ""
    echo -e "  ${CYAN}1)${NC} 🔧 Cambiar entorno (dev, qa, prd)"
    echo -e "  ${CYAN}2)${NC} 🌐 Actualizar IP para Expo / Android"
    echo -e "  ${CYAN}3)${NC} 🔍 Verificar IP de Expo / Android"
    echo -e "  ${CYAN}4)${NC} 📋 Listar variables de entorno"
    echo ""
    echo -e "  ${CYAN}V)${NC} ⬅️ Volver"
    echo -e "  ${CYAN}S)${NC} 🚪 Salir"
    echo ""
    
    read -p "$(echo -e ${CYAN}"👉 Seleccione una opción: "${NC})" choice
    
    case "$choice" in
        1) change_env ;;
        2) update_ip_menu ;;
        3) check_ip_menu ;;
        4) validate_container_env ;;
        [Vv]) menu ;;
        [Ss]) exit_script ;;
        *)
            echo -e "${RED}❌ Opción inválida${NC}"
            sleep 2
            menu_configuracion
            ;;
    esac
}

# Menú de backup
menu_backup() {
    banner_principal "BACKUP Y RESTORE"
    
    echo -e "${BOLD}OPCIONES DISPONIBLES:${NC}"
    echo ""
    echo -e "  ${CYAN}1)${NC} 💾 Backup de volúmenes"
    echo -e "  ${CYAN}2)${NC} 🔄 Restaurar volumen"
    echo ""
    echo -e "  ${CYAN}V)${NC} ⬅️ Volver"
    echo -e "  ${CYAN}S)${NC} 🚪 Salir"
    echo ""
    
    read -p "$(echo -e ${CYAN}"👉 Seleccione una opción: "${NC})" choice
    
    case "$choice" in
        1) backup_volumes ;;
        2) restore_volume ;;
        [Vv]) menu ;;
        [Ss]) exit_script ;;
        *)
            echo -e "${RED}❌ Opción inválida${NC}"
            sleep 2
            menu_backup
            ;;
    esac
}

# ==================================================
# FUNCIONES DE ACCIÓN (Simplificadas para este ejemplo)
# ==================================================

up() {
    banner_principal "INICIAR CONTENEDORES"
    if ! validate_compose_env_files; then
        pause
        menu_contenedores
        return
    fi
    ask_service_groups
    run_cmd "$(build_compose_cmd "up -d --build" "$SELECTED_PROFILE_ARGS" "$SELECTED_SERVICE_ARGS")" \
            "Error al iniciar contenedores" \
            "Contenedores iniciados exitosamente"
    pause
    menu_contenedores
}

down() {
    banner_principal "DETENER CONTENEDORES"
    if ! validate_compose_env_files; then
        pause
        menu_contenedores
        return
    fi
    if confirm_action "¿Detener y eliminar todos los contenedores del stack?" "no"; then
        run_cmd "$COMPOSE_CMD -f $COMPOSE_FILE --env-file .env --env-file .env.$ENV --profile tools down" \
                "Error al detener contenedores" \
                "Contenedores detenidos exitosamente"
    fi
    pause
    menu_contenedores
}

restart() {
    banner_principal "REINICIAR CONTENEDORES"
    if ! validate_compose_env_files; then
        pause
        menu_contenedores
        return
    fi
    if confirm_action "¿Reiniciar todos los contenedores del stack?" "no"; then
        ask_service_groups
        run_cmd "$(build_compose_cmd "down" "--profile tools")" \
                "Error al detener contenedores"
        run_cmd "$(build_compose_cmd "up -d --build" "$SELECTED_PROFILE_ARGS" "$SELECTED_SERVICE_ARGS")" \
                "Error al iniciar contenedores" \
                "Contenedores reiniciados exitosamente"
    fi
    pause
    menu_contenedores
}

restart_single_container() {
    banner_principal "REINICIAR CONTENEDOR ÚNICO"
    
    if ! select_container_from_stack "Seleccione contenedor a reiniciar" true false; then
        menu_contenedores
        return
    fi
    
    if confirm_action "¿Reiniciar contenedor $SELECTED_CONTAINER_NAME?" "no"; then
        run_cmd "docker restart $SELECTED_CONTAINER_ID" \
                "Error al reiniciar contenedor" \
                "Contenedor reiniciado exitosamente"
    fi
    
    pause
    menu_contenedores
}

get_compose_service_from_container() {
    local container_id="$1"
    docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$container_id" 2>/dev/null
}

get_profile_args_for_service() {
    local service_name="$1"
    local service_block=""
    local group_value=""

    service_block="$(get_service_block_from_compose "$COMPOSE_FILE" "$service_name")"
    group_value="$(echo "$service_block" | sed -n 's/^[[:space:]]*service\.group: //p' | head -1)"

    if [[ "$group_value" == "tools" ]]; then
        echo "--profile tools"
    else
        echo ""
    fi
}

recreate_single_container() {
    banner_principal "RECREAR CONTENEDOR ÚNICO"

    if ! validate_compose_env_files; then
        pause
        menu_contenedores
        return
    fi

    if ! select_container_from_stack "Seleccione contenedor a recrear" true false; then
        menu_contenedores
        return
    fi

    local selected_service=""
    local selected_profile_args=""

    selected_service="$(get_compose_service_from_container "$SELECTED_CONTAINER_ID")"
    if [[ -z "$selected_service" || "$selected_service" == "<no value>" ]]; then
        echo -e "${RED}❌ No se pudo resolver el servicio Docker Compose para ${SELECTED_CONTAINER_NAME}${NC}"
        echo -e "${YELLOW}   └─ Verifique que el contenedor pertenezca al stack gestionado por Compose.${NC}"
        pause
        menu_contenedores
        return
    fi

    selected_profile_args="$(get_profile_args_for_service "$selected_service")"

    echo ""
    echo -e "${BLUE}Servicio asociado:${NC} ${BOLD}${selected_service}${NC}"
    [[ -n "$selected_profile_args" ]] && echo -e "${BLUE}Perfil requerido:${NC} ${BOLD}${selected_profile_args}${NC}"

    if confirm_action "¿Recrear contenedor ${SELECTED_CONTAINER_NAME} usando el servicio ${selected_service}? Esto removerá y volverá a crear solo ese servicio." "no"; then
        run_cmd "$(build_compose_cmd "up -d --force-recreate --no-deps" "$selected_profile_args" "$selected_service")" \
                "Error al recrear contenedor" \
                "Contenedor recreado exitosamente"
    fi

    pause
    menu_contenedores
}

build() {
    banner_principal "CONSTRUIR IMÁGENES"
    if ! validate_compose_env_files; then
        pause
        menu_contenedores
        return
    fi
    ask_service_groups
    run_cmd "$(build_compose_cmd "build" "$SELECTED_PROFILE_ARGS" "$SELECTED_SERVICE_ARGS")" \
            "Error al construir imágenes" \
            "Imágenes construidas exitosamente"
    pause
    menu_contenedores
}

logs() {
    banner_principal "VER LOGS"
    if ! validate_compose_env_files; then
        pause
        menu_monitoreo
        return
    fi
    $(build_compose_cmd "logs -f")
    pause
    menu_monitoreo
}

logs_single_container() {
    banner_principal "LOGS DE CONTENEDOR"

    if ! select_container_from_stack "Seleccione contenedor para ver logs" true true; then
        menu_monitoreo
        return
    fi

    docker logs -f "$SELECTED_CONTAINER_ID"
    pause
    menu_monitoreo
}

ps() {
    banner_principal "ESTADO DE CONTENEDORES"
    if ! validate_compose_env_files; then
        pause
        menu_monitoreo
        return
    fi
    $(build_compose_cmd "ps")
    pause
    menu_monitoreo
}

list_stack() {
    banner_principal "LISTAR CONTENEDORES"
    list_stack_containers "detailed" true
    pause
    menu_monitoreo
}

exec_stack() {
    banner_principal "TERMINAL EN CONTENEDOR"
    
    if ! select_container_from_stack "Seleccione contenedor para acceder" true false; then
        menu_monitoreo
        return
    fi
    
    echo -e "${GREEN}Conectando a $SELECTED_CONTAINER_NAME...${NC}"
    
    # Intentar bash, luego sh
    if docker exec -it "$SELECTED_CONTAINER_ID" bash -c "echo" 2>/dev/null; then
        docker exec -it "$SELECTED_CONTAINER_ID" bash
    else
        docker exec -it "$SELECTED_CONTAINER_ID" sh
    fi
    
    pause
    menu_monitoreo
}

clean() {
    banner_principal "LIMPIEZA DE RECURSOS"
    if ! validate_compose_env_files; then
        pause
        menu_limpieza
        return
    fi
    if confirm_action "¿Limpiar contenedores, redes y volúmenes del stack?" "no"; then
        run_cmd "$(build_compose_cmd "down --volumes --remove-orphans" "--profile tools")" \
                "Error durante la limpieza" \
                "Limpieza completada"
    fi
    pause
    menu_limpieza
}

clean_volumes() {
    banner_principal "LIMPIAR VOLÚMENES"
    if confirm_action "¿Eliminar todos los volúmenes no utilizados?" "no"; then
        run_cmd "docker volume prune -f" \
                "Error al limpiar volúmenes" \
                "Volúmenes no utilizados eliminados"
    fi
    pause
    menu_limpieza
}

clean_build_cache() {
    banner_principal "LIMPIAR CACHÉ DE BUILDS"

    echo -e "${YELLOW}Se eliminará la caché de construcción de Docker.${NC}"
    echo -e "${YELLOW}Esto no borra contenedores, volúmenes ni imágenes en uso.${NC}"
    echo ""

    if confirm_action "¿Eliminar la caché de builds de Docker?" "no"; then
        run_cmd "docker builder prune -af" \
                "Error al limpiar caché de builds" \
                "Caché de builds eliminada"

        if docker buildx version >/dev/null 2>&1; then
            run_cmd "docker buildx prune -af" \
                    "Error al limpiar caché de buildx" \
                    "Caché de buildx eliminada"
        fi
    fi

    pause
    menu_limpieza
}

clean_all() {
    banner_principal "LIMPIEZA COMPLETA"
    if ! validate_compose_env_files; then
        pause
        menu_limpieza
        return
    fi
    
    echo -e "${RED}${BOLD}⚠️  ADVERTENCIA: Esta acción realizará una limpieza profunda del sistema${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Se eliminarán:${NC}"
    echo -e "   • Contenedores, redes y volúmenes del stack actual"
    echo -e "   • Volúmenes huérfanos relacionados con el stack"
    echo -e "   • Imágenes base e Imágenes proyecto (Confirmación)"
    echo -e "   • Caché de builds de Docker"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
     # PRIMERA CONFIRMACIÓN: Inicio de limpieza
    if ! confirm_action "¿Iniciar limpieza completa?" "no"; then
        menu_limpieza
        return
    fi
    
    # PASO 1: Limpiar contenedores, redes y volúmenes del stack
    echo -e "\n${CYAN}${BOLD}📦 PASO 1/3: Limpiando recursos del stack...${NC}"
    echo -e "${CYAN}────────────────────────────────────────────────${NC}"
    
    run_cmd "$(build_compose_cmd "down --volumes --remove-orphans" "--profile tools")" \
            "Error al limpiar recursos del stack" \
            "Recursos del stack eliminados"
    
    # PASO 2: Limpiar volúmenes huérfanos del stack
    echo -e "\n${CYAN}${BOLD}💾 PASO 2/3: Buscando volúmenes huérfanos del stack...${NC}"
    echo -e "${CYAN}────────────────────────────────────────────────${NC}"
    
    local stack_volumes=()
    while IFS= read -r volume; do
        stack_volumes+=("$volume")
    done < <(docker volume ls --filter "dangling=true" --filter "label=$LABEL_FILTER" --format "{{.Name}}" 2>/dev/null)
    
    if [[ ${#stack_volumes[@]} -gt 0 ]]; then
        echo -e "${YELLOW}Se encontraron ${#stack_volumes[@]} volúmenes huérfanos del stack:${NC}"
        for volume in "${stack_volumes[@]}"; do
            echo -e "   • $volume"
        done
        echo ""
        
        for volume in "${stack_volumes[@]}"; do
            docker volume rm "$volume" >/dev/null 2>&1 && \
                echo -e "${GREEN}   ✅ Eliminado: $volume${NC}" || \
                echo -e "${RED}   ❌ Error al eliminar: $volume${NC}"
        done
    else
        echo -e "${GREEN}✅ No se encontraron volúmenes huérfanos del stack${NC}"
    fi
    
    # Limpiar imágenes huérfanas (automático)
    echo -e "\n${CYAN}${BOLD}🗑️  Eliminando imágenes huérfanas...${NC}"
    docker image prune -f >/dev/null 2>&1
    echo -e "${GREEN}✅ Imágenes huérfanas eliminadas${NC}"
    
    # PASO 3: Limpieza de imágenes (con consultas separadas)
    echo -e "\n${CYAN}${BOLD}🖼️  PASO 3/3: Limpieza de imágenes Docker${NC}"
    echo -e "${CYAN}────────────────────────────────────────────────${NC}"
    
    local project_name="${PROJECT_NAME:-inventario}"
    
    # Obtener imágenes base (excluyendo las del proyecto)
    local base_images=()
    while IFS= read -r image; do
        if [[ -n "$image" && "$image" != "<none>:<none>" ]]; then
            base_images+=("$image")
        fi
    done < <(docker images --format "{{.Repository}}:{{.Tag}}" | grep -v "^${project_name}/" | grep -v "<none>" | sort -u)
    
    # Obtener imágenes del proyecto
    local project_images=()
    while IFS= read -r image; do
        if [[ -n "$image" ]]; then
            project_images+=("$image")
        fi
    done < <(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^${project_name}/" | sort -u)
    
    # SEGUNDA CONFIRMACIÓN: Imágenes base (externas)
    if [[ ${#base_images[@]} -gt 0 ]]; then
        echo -e "\n${BLUE}${BOLD}📦 IMÁGENES BASE (EXTERNAS) - ${#base_images[@]} encontradas${NC}"
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}Estas imágenes son descargadas de Docker Hub:${NC}"
        echo ""
        
        # Mostrar lista de imágenes base
        for image in "${base_images[@]}"; do
            local size=$(docker images --format "{{.Size}}" "$image" 2>/dev/null | head -1)
            echo -e "   • $image ${CYAN}(${size})${NC}"
        done
        echo ""
        
        if confirm_action "¿Eliminar TODAS las imágenes base?" "no"; then
            echo -e "${YELLOW}Eliminando imágenes base...${NC}"
            local deleted=0
            for image in "${base_images[@]}"; do
                if docker rmi -f "$image" >/dev/null 2>&1; then
                    echo -e "${GREEN}   ✅ Eliminada: $image${NC}"
                    ((deleted++))
                else
                    echo -e "${RED}   ❌ Error al eliminar: $image${NC}"
                fi
            done
            echo -e "${GREEN}✅ Imágenes base eliminadas: $deleted de ${#base_images[@]}${NC}"
        else
            echo -e "${BLUE}⏭️  Imágenes base conservadas${NC}"
        fi
    else
        echo -e "\n${GREEN}✅ No hay imágenes base para eliminar${NC}"
    fi
    
    # TERCERA CONFIRMACIÓN: Imágenes del proyecto
    if [[ ${#project_images[@]} -gt 0 ]]; then
        echo -e "\n${MAGENTA}${BOLD}🏗️  IMÁGENES DEL PROYECTO - ${#project_images[@]} encontradas${NC}"
        echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}Estas imágenes fueron construidas desde Dockerfiles locales:${NC}"
        echo ""
        
        # Mostrar lista de imágenes del proyecto
        for image in "${project_images[@]}"; do
            local size=$(docker images --format "{{.Size}}" "$image" 2>/dev/null | head -1)
            echo -e "   • $image ${CYAN}(${size})${NC}"
        done
        echo ""
        
        if confirm_action "¿Eliminar TODAS las imágenes del proyecto?" "no"; then
            echo -e "${YELLOW}Eliminando imágenes del proyecto...${NC}"
            local deleted=0
            for image in "${project_images[@]}"; do
                if docker rmi -f "$image" >/dev/null 2>&1; then
                    echo -e "${GREEN}   ✅ Eliminada: $image${NC}"
                    ((deleted++))
                else
                    echo -e "${RED}   ❌ Error al eliminar: $image${NC}"
                fi
            done
            echo -e "${GREEN}✅ Imágenes del proyecto eliminadas: $deleted de ${#project_images[@]}${NC}"
        else
            echo -e "${BLUE}⏭️  Imágenes del proyecto conservadas${NC}"
        fi
    else
        echo -e "\n${GREEN}✅ No hay imágenes del proyecto para eliminar${NC}"
    fi
    
    # Limpiar caché de builds (automático)
    echo -e "\n${CYAN}${BOLD}🧹 Limpiando caché de builds...${NC}"
    docker builder prune -af >/dev/null 2>&1
    if docker buildx version >/dev/null 2>&1; then
        docker buildx prune -af >/dev/null 2>&1
    fi
    echo -e "${GREEN}✅ Caché de builds eliminada${NC}"
    
    # RESUMEN FINAL
    echo ""
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}✅ LIMPIEZA COMPLETA FINALIZADA${NC}"
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
    
    pause
    menu_limpieza
}

drop_persistence() {
    banner_principal "ELIMINAR PERSISTENCIAS"
    local data_root
    local logs_root
    local volumes_root
    data_root="$(get_runtime_data_root)"
    logs_root="$(get_runtime_logs_root)"
    volumes_root="$(get_runtime_volumes_root)"
    
    echo -e "${RED}${BOLD}⚠️  ADVERTENCIA: Esta acción eliminará:${NC}"
    echo -e "   • Volúmenes Docker nombrados del proyecto"
    echo -e "   • Artefactos de runtime en ${volumes_root}"
    echo -e "   • Datos de ${data_root}"
    echo -e "   • Logs de ${logs_root}"
    echo ""
    
    if confirm_action "¿Eliminar todas las persistencias?" "no"; then
        
        # ===========================================
        # CAMBIAR PERMISOS (siempre se ejecuta)
        # ===========================================
        echo -e "${YELLOW}Cambiando permisos de archivos...${NC}"
        
        ensure_path_writable "$data_root" "datos persistentes"
        ensure_path_writable "$logs_root" "logs persistentes"
        ensure_path_writable "$volumes_root" "artefactos runtime"
        
        echo ""
        
        # ===========================================
        # 1. VOLÚMENES DOCKER NOMBRADOS
        # ===========================================
        if confirm_action "¿Eliminar volúmenes Docker nombrados del proyecto?" "no"; then
            local named_volumes=("${PROJECT_NAME}_frontend_node_modules")
            local deleted_named=false
            for volume_name in "${named_volumes[@]}"; do
                if docker volume inspect "$volume_name" >/dev/null 2>&1; then
                    if docker volume rm "$volume_name" >/dev/null 2>&1; then
                        deleted_named=true
                        echo -e "${GREEN}✅ Eliminado: $volume_name${NC}"
                    else
                        echo -e "${YELLOW}⚠️  No se pudo eliminar $volume_name (puede estar en uso)${NC}"
                    fi
                fi
            done
            if [[ "$deleted_named" == false ]]; then
                echo -e "${YELLOW}⚠️  No se encontraron volúmenes Docker nombrados del proyecto para eliminar${NC}"
            fi
        else
            echo -e "${YELLOW}⏭️  Omitida eliminación de volúmenes Docker nombrados${NC}"
        fi
        
        # ===========================================
        # 2. ARTEFACTOS DE RUNTIME
        # ===========================================
        if confirm_action "¿Eliminar artefactos de runtime de Node/Python en ${volumes_root}?" "no"; then
            clean_runtime_artifacts
        else
            echo -e "${YELLOW}⏭️  Omitida eliminación de artefactos de runtime${NC}"
        fi
        
        # ===========================================
        # 3. PERSISTENCE DATA
        # ===========================================
        if confirm_action "¿Eliminar carpetas de ${data_root}?" "no"; then
            remove_directory_contents "$data_root" "$data_root"
        else
            echo -e "${YELLOW}⏭️  Omitida eliminación de ${data_root}${NC}"
        fi
        
        # ===========================================
        # 4. PERSISTENCE LOGS
        # ===========================================
        if confirm_action "¿Eliminar contenido de ${logs_root}?" "no"; then
            remove_directory_contents "$logs_root" "$logs_root"
        else
            echo -e "${YELLOW}⏭️  Omitida eliminación de ${logs_root}${NC}"
        fi
    fi
    
    pause
    menu_limpieza
}

change_env() {
    banner_principal "CAMBIAR ENTORNO"
    
    echo -e "Entorno actual: $(get_env_color)"
    echo ""
    echo -e "Opciones disponibles:"
    echo -e "  ${CYAN}1)${NC} ${GREEN}dev${NC}"
    echo -e "  ${CYAN}2)${NC} ${YELLOW}qa${NC}"
    echo -e "  ${CYAN}3)${NC} ${RED}prd${NC}"
    echo ""
    
    read -p "$(echo -e ${CYAN}"Seleccione nuevo entorno: "${NC})" env_choice
    
    case "$env_choice" in
        1) ENV="dev" ;;
        2) ENV="qa" ;;
        3) ENV="prd" ;;
        *)
            echo -e "${RED}❌ Opción inválida${NC}"
            sleep 2
            menu_configuracion
            return
            ;;
    esac
    
    export ENV
    define_compose_file
    echo -e "${GREEN}✅ Entorno cambiado a: $(get_env_color)${NC}"
    pause
    menu_configuracion
}

update_ip_menu() {
    banner_principal "ACTUALIZAR IP EXPO / ANDROID"
    
    local current_ip=$(get_current_ip)
    local env_file=".env"
    
    if [[ ! -f "$env_file" ]]; then
        echo -e "${RED}❌ Error: Archivo .env no encontrado${NC}"
        pause
        menu_configuracion
        return
    fi
    
    echo -e "IP actual detectada: ${CYAN}$current_ip${NC}"
    echo -e "${BLUE}Se usará para REACT_NATIVE_PACKAGER_HOSTNAME en Expo / android_app.${NC}"
    
    if [[ -z "$current_ip" ]]; then
        echo -e "${YELLOW}⚠️  No se pudo detectar IP automáticamente${NC}"
        read -p "Ingrese IP manualmente: " current_ip
    fi
    
    if confirm_action "¿Actualizar REACT_NATIVE_PACKAGER_HOSTNAME en .env a $current_ip?" "si"; then
        if grep -q "^REACT_NATIVE_PACKAGER_HOSTNAME=" "$env_file"; then
            sed_in_place "s/^REACT_NATIVE_PACKAGER_HOSTNAME=.*/REACT_NATIVE_PACKAGER_HOSTNAME=$current_ip/" "$env_file" --backup
        else
            echo "REACT_NATIVE_PACKAGER_HOSTNAME=$current_ip" >> "$env_file"
        fi
        echo -e "${GREEN}✅ IP actualizada exitosamente${NC}"
    fi
    
    pause
    menu_configuracion
}

check_ip_menu() {
    banner_principal "VERIFICAR IP EXPO / ANDROID"
    
    local current_ip=$(get_current_ip)
    local env_file=".env"
    
    echo -e "IP actual del equipo: ${CYAN}${current_ip:-No detectada}${NC}"
    
    if [[ -f "$env_file" ]]; then
        local env_ip=$(grep "^REACT_NATIVE_PACKAGER_HOSTNAME=" "$env_file" | cut -d'=' -f2)
        echo -e "REACT_NATIVE_PACKAGER_HOSTNAME en .env: ${CYAN}${env_ip:-No configurada}${NC}"
        
        if [[ -n "$current_ip" && -n "$env_ip" ]]; then
            if [[ "$current_ip" == "$env_ip" ]]; then
                echo -e "${GREEN}✅ Las IPs coinciden${NC}"
            else
                echo -e "${YELLOW}⚠️  Las IPs NO coinciden${NC}"
            fi
        fi
    fi
    
    pause
    menu_configuracion
}

validate_container_env() {
    banner_principal "VARIABLES DE ENTORNO"
    
    if ! select_container_from_stack "Seleccione contenedor" true false; then
        menu_configuracion
        return
    fi
    
    echo -e "\n${CYAN}${BOLD}📋 Variables de entorno en $SELECTED_CONTAINER_NAME:${NC}"
    echo "═══════════════════════════════════════════════════════════"
    docker exec "$SELECTED_CONTAINER_ID" env 2>/dev/null | sort | nl
    
    pause
    menu_configuracion
}

# ==================================================
# FUNCIONES DE MONITOREO MEJORADAS
# ==================================================

monitor_resources() {
    banner_principal "MONITOREO DE RECURSOS"
    
    if ! check_stack_containers; then
        pause
        menu_monitoreo
        return
    fi
    
    echo -e "${CYAN}${BOLD}📊 ESTADÍSTICAS DE CONTENEDORES${NC}"
    echo -e "${YELLOW}Presione Ctrl+C para salir${NC}"
    echo ""
    
    docker stats --filter "label=$LABEL_FILTER" --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}"
    
    pause
    menu_monitoreo
}

# ==================================================
# FUNCIONES DE VALIDACIÓN
# ==================================================

validate_compose() {
    banner_principal "VALIDAR DOCKER COMPOSE"
    
    if ! check_file_exists "$COMPOSE_FILE" "validación de sintaxis"; then
        pause
        menu_contenedores
        return
    fi

    if ! validate_compose_env_files; then
        pause
        menu_contenedores
        return
    fi
    
    echo -e "${BLUE}Validando configuración...${NC}"
    echo ""
    
    if $(build_compose_cmd "config") > /dev/null 2>&1; then
        echo -e "${GREEN}${BOLD}✅ VALIDACIÓN EXITOSA${NC}"
        echo ""
        echo -e "${CYAN}📋 SERVICIOS CONFIGURADOS:${NC}"
        print_grouped_services_summary
    else
        echo -e "${RED}${BOLD}❌ ERROR DE VALIDACIÓN${NC}"
        echo ""
        $(build_compose_cmd "config")
    fi
    
    pause
    menu_contenedores
}

validate_compose_rules() {
    banner_principal "VALIDAR REGLAS DEL COMPOSE"

    if ! check_file_exists "$COMPOSE_FILE" "validación de reglas"; then
        pause
        menu_contenedores
        return
    fi

    if ! validate_compose_env_files; then
        pause
        menu_contenedores
        return
    fi

    local tmp_config
    tmp_config="$(mktemp)"

    if ! eval "$(build_compose_cmd "config" "--profile tools")" >"$tmp_config" 2>/dev/null; then
        echo -e "${RED}❌ No se pudo expandir la configuración de Compose para validar reglas${NC}"
        rm -f "$tmp_config"
        pause
        menu_contenedores
        return
    fi

    local services=()
    while IFS= read -r service_name; do
        [[ -n "$service_name" ]] && services+=("$service_name")
    done < <(eval "$(build_compose_cmd "config --services" "--profile tools")" 2>/dev/null)

    local errors=0
    local warnings=0
    local service_name=""

    echo -e "${CYAN}${BOLD}📋 REGLAS EVALUADAS:${NC}"
    echo -e "   • container_name debe usar ${PROJECT_NAME}-<servicio>"
    echo -e "   • labels requeridos: stack, env, service.group, service.lifecycle"
    echo -e "   • service.group debe ser: core, dependency o tools"
    echo -e "   • no deben existir rutas legacy del layout anterior"
    echo ""

    for service_name in "${services[@]}"; do
        local source_block
        local expanded_block
        local expected_container_name="${PROJECT_NAME}-${service_name}"
        local group_value=""

        source_block="$(get_service_block_from_compose "$COMPOSE_FILE" "$service_name")"
        expanded_block="$(awk -v target="$service_name" '
            BEGIN {
                in_services = 0
                in_target = 0
            }
            /^services:/ {
                in_services = 1
                next
            }
            in_services && /^[^[:space:]]/ {
                if (in_target) {
                    exit
                }
            }
            in_services && $0 ~ ("^  " target ":$") {
                in_target = 1
                print
                next
            }
            in_target && /^  [a-zA-Z0-9_-]+:/ {
                exit
            }
            in_target {
                print
            }
        ' "$tmp_config")"

        echo -e "${BLUE}${BOLD}Servicio:${NC} ${service_name}"

        if [[ -z "$source_block" ]]; then
            echo -e "${RED}   ❌ No se pudo localizar el bloque del servicio en ${COMPOSE_FILE}${NC}"
            ((errors++))
            continue
        fi

        if echo "$expanded_block" | grep -q "container_name: ${expected_container_name}$"; then
            echo -e "${GREEN}   ✅ container_name correcto (${expected_container_name})${NC}"
        else
            echo -e "${RED}   ❌ container_name inválido. Se espera ${expected_container_name}${NC}"
            ((errors++))
        fi

        if echo "$expanded_block" | grep -q "stack: ${PROJECT_NAME}$"; then
            echo -e "${GREEN}   ✅ label stack correcto${NC}"
        else
            echo -e "${RED}   ❌ falta label stack=${PROJECT_NAME}${NC}"
            ((errors++))
        fi

        if echo "$expanded_block" | grep -q "env: ${ENV}$"; then
            echo -e "${GREEN}   ✅ label env correcto${NC}"
        else
            echo -e "${RED}   ❌ falta label env=${ENV}${NC}"
            ((errors++))
        fi

        group_value="$(echo "$expanded_block" | sed -n 's/^[[:space:]]*service\.group: //p' | head -1)"
        if [[ "$group_value" =~ ^(core|dependency|tools)$ ]]; then
            echo -e "${GREEN}   ✅ service.group válido (${group_value})${NC}"
        else
            echo -e "${RED}   ❌ service.group inválido o ausente${NC}"
            ((errors++))
        fi

        if echo "$expanded_block" | grep -q "service.lifecycle:"; then
            echo -e "${GREEN}   ✅ service.lifecycle presente${NC}"
        else
            echo -e "${RED}   ❌ falta service.lifecycle${NC}"
            ((errors++))
        fi

        if echo "$source_block" | grep -Eq 'Data/dokerFile|persistence/|APP/data-prd|APP/data-qa|APP/logs-prd|APP/logs-qa|APP/data/settings'; then
            echo -e "${RED}   ❌ el servicio usa rutas legacy del layout anterior${NC}"
            ((errors++))
        fi

        if echo "$source_block" | grep -qE '^\s+- \./'; then
            echo -e "${YELLOW}   ⚠️  hay mounts hardcodeados con rutas relativas directas; revisar si deben usar variables de entorno${NC}"
            ((warnings++))
        fi

        echo ""
    done

    rm -f "$tmp_config"

    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
    if [[ $errors -eq 0 ]]; then
        echo -e "${GREEN}${BOLD}✅ VALIDACIÓN DE REGLAS SUPERADA${NC}"
    else
        echo -e "${RED}${BOLD}❌ VALIDACIÓN DE REGLAS CON ERRORES${NC}"
    fi
    echo -e "${CYAN}Errores:${NC} $errors"
    echo -e "${CYAN}Advertencias:${NC} $warnings"
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"

    pause
    menu_contenedores
}

# ==================================================
# FUNCIONES DE BACKUP
# ==================================================

backup_volumes() {
    banner_principal "BACKUP DE VOLÚMENES"
    
    mkdir -p "$BACKUP_DIR"
    
    echo -e "${CYAN}${BOLD}📦 VOLÚMENES DEL PROYECTO:${NC}"
    echo ""
    
    local volumes=()
    while IFS= read -r volume; do
        volumes+=("$volume")
    done < <(list_project_named_volumes)
    
    if [[ ${#volumes[@]} -eq 0 ]]; then
        echo -e "${YELLOW}⚠️  No hay volúmenes nombrados del proyecto disponibles${NC}"
        pause
        menu_backup
        return
    fi
    
    for i in "${!volumes[@]}"; do
        printf "  ${CYAN}%2d)${NC} %s\n" $((i+1)) "${volumes[$i]}"
    done
    
    echo ""
    echo "  ${CYAN}T)${NC} Todos los volúmenes"
    echo "  ${CYAN}V)${NC} ⬅️ Volver al menú anterior"
    echo ""
    
    read -p "$(echo -e ${CYAN}"Seleccione volumen a respaldar: "${NC})" vol_choice
    
    # Opción para volver
    if [[ "$vol_choice" =~ ^[Vv]$ ]]; then
        echo -e "${BLUE}⏭️  Volviendo al menú anterior...${NC}"
        sleep 1
        menu_backup
        return
    fi
    
    local volumes_to_backup=()
    if [[ "$vol_choice" =~ ^[Tt]$ ]]; then
        volumes_to_backup=("${volumes[@]}")
    elif [[ "$vol_choice" =~ ^[0-9]+$ ]] && [[ "$vol_choice" -ge 1 ]] && [[ "$vol_choice" -le ${#volumes[@]} ]]; then
        volumes_to_backup=("${volumes[$((vol_choice-1))]}")
    else
        echo -e "${RED}❌ Opción inválida${NC}"
        echo -e "${YELLOW}   Las opciones válidas son: número del 1 al ${#volumes[@]}, T o V${NC}"
        pause
        backup_volumes  # Volver a mostrar el menú de backup
        return
    fi
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local success_count=0
    local error_count=0
    
    for volume in "${volumes_to_backup[@]}"; do
        local backup_file="$BACKUP_DIR/${volume}_$timestamp.tar.gz"
        echo -e "${BLUE}⏳ Respaldando volumen: $volume${NC}"
        
        if docker run --rm -v "$volume":/source -v "$(pwd)/$BACKUP_DIR":/backup alpine tar czf "/backup/$(basename "$backup_file")" -C /source . 2>/dev/null; then
            local size=$(du -h "$backup_file" | cut -f1)
            echo -e "${GREEN}✅ Backup creado: $backup_file ($size)${NC}"
            ((success_count++))
        else
            echo -e "${RED}❌ Error al respaldar $volume${NC}"
            ((error_count++))
        fi
    done
    
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ Backup completado: $success_count exitosos, $error_count errores${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    
    pause
    menu_backup
}

restore_volume() {
    banner_principal "RESTAURAR VOLUMEN"
    
    if [[ ! -d "$BACKUP_DIR" ]] || [[ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]]; then
        echo -e "${YELLOW}⚠️  No hay backups disponibles${NC}"
        pause
        menu_backup
        return
    fi
    
    echo -e "${CYAN}${BOLD}📦 BACKUPS DISPONIBLES:${NC}"
    echo ""
    
    local backups=()
    while IFS= read -r backup; do
        backups+=("$backup")
    done < <(ls -1 "$BACKUP_DIR"/*.tar.gz 2>/dev/null | xargs -n1 basename)
    
    for i in "${!backups[@]}"; do
        local backup_file="${backups[$i]}"
        local size=$(du -h "$BACKUP_DIR/$backup_file" | cut -f1)
        printf "  ${CYAN}%2d)${NC} %-40s ${YELLOW}[%s]${NC}\n" $((i+1)) "$backup_file" "$size"
    done
    
    echo ""
    read -p "$(echo -e ${CYAN}"Seleccione backup a restaurar: "${NC})" backup_choice
    
    if ! [[ "$backup_choice" =~ ^[0-9]+$ ]] || [[ "$backup_choice" -lt 1 ]] || [[ "$backup_choice" -gt ${#backups[@]} ]]; then
        echo -e "${RED}❌ Opción inválida${NC}"
        pause
        return
    fi
    
    local selected_backup="${backups[$((backup_choice-1))]}"
    local volume_name
    volume_name="$(get_volume_name_from_backup "$selected_backup")"

    if [[ -z "$volume_name" ]]; then
        echo -e "${RED}❌ No se pudo determinar el volumen a restaurar desde $selected_backup${NC}"
        pause
        menu_backup
        return
    fi
    
    echo ""
    echo -e "${YELLOW}⚠️  Se restaurará el volumen: $volume_name${NC}"
    
    if ! confirm_action "¿Continuar con la restauración?" "no"; then
        menu_backup
        return
    fi
    
    # Verificar si el volumen existe
    if docker volume ls -q | grep -q "^$volume_name$"; then
        if confirm_action "¿Eliminar volumen existente antes de restaurar?" "no"; then
            docker volume rm "$volume_name" >/dev/null 2>&1
        else
            echo -e "${BLUE}⏭️  Restauración cancelada${NC}"
            pause
            return
        fi
    fi
    
    # Crear nuevo volumen y restaurar
    docker volume create "$volume_name" >/dev/null
    echo -e "${GREEN}✅ Volumen creado: $volume_name${NC}"
    
    if docker run --rm -v "$volume_name":/target -v "$(pwd)/$BACKUP_DIR":/backup alpine tar xzf "/backup/$selected_backup" -C /target 2>/dev/null; then
        echo -e "${GREEN}✅ Volumen restaurado exitosamente${NC}"
    else
        echo -e "${RED}❌ Error al restaurar el volumen${NC}"
    fi
    
    pause
    menu_backup
}

# ==================================================
# FUNCIONES DE LIMPIEZA MEJORADAS
# ==================================================

clean_images_enhanced() {
    banner_principal "LIMPIEZA DE IMÁGENES"
    
    echo -e "${CYAN}${BOLD}📊 ANÁLISIS DE IMÁGENES DOCKER${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Obtener estadísticas
    local total_images=$(docker images -q | wc -l)
    local dangling_images=$(docker images -f "dangling=true" -q | wc -l)
    
    echo -e "   ${BOLD}Total de imágenes:${NC} $total_images"
    echo -e "   ${YELLOW}Imágenes huérfanas:${NC} $dangling_images"
    echo ""
    
    # Mostrar imágenes huérfanas
    if [[ $dangling_images -gt 0 ]]; then
        echo -e "${YELLOW}${BOLD}🗑️  IMÁGENES HUÉRFANAS:${NC}"
        echo -e "${YELLOW}────────────────────────────────────────────────${NC}"
        docker images -f "dangling=true" --format "   • {{.ID}} ({{.Size}}) - Creada: {{.CreatedSince}}"
        echo ""
        
        if confirm_action "¿Eliminar imágenes huérfanas?" "si"; then
            run_cmd "docker image prune -f" "Error al limpiar" "Imágenes huérfanas eliminadas"
        fi
    fi
    
    # Preguntar por imágenes no utilizadas
    echo ""
    if confirm_action "¿Eliminar todas las imágenes no utilizadas?" "no"; then
        run_cmd "docker image prune -af" "Error al limpiar" "Imágenes no utilizadas eliminadas"
    fi
    
    pause
    menu_limpieza
}

# ==================================================
# FUNCIONES DE MENÚ FALTANTES (Templates, Expo, Docker Services, Portainer)
# ==================================================

menu_templates() {
    banner_principal "GESTIÓN DE TEMPLATES .ENV"
    
    echo -e "${BOLD}OPCIONES DISPONIBLES:${NC}"
    echo ""
    echo -e "  ${CYAN}1)${NC} 🔨 Generar .env.template"
    echo -e "  ${CYAN}2)${NC} 📋 Generar archivos .env desde template"
    echo -e "  ${CYAN}3)${NC} 🔍 Verificar archivos .env"
    echo ""
    echo -e "  ${CYAN}V)${NC} ⬅️ Volver"
    echo -e "  ${CYAN}S)${NC} 🚪 Salir"
    echo ""
    
    read -p "$(echo -e ${CYAN}"👉 Seleccione una opción: "${NC})" choice
    
    case "$choice" in
        1) 
            echo -e "${YELLOW}⚠️  Función en desarrollo${NC}"
            sleep 2
            menu_templates 
            ;;
        2) 
            echo -e "${YELLOW}⚠️  Función en desarrollo${NC}"
            sleep 2
            menu_templates 
            ;;
        3) 
            echo -e "${YELLOW}⚠️  Función en desarrollo${NC}"
            sleep 2
            menu_templates 
            ;;
        [Vv]) menu ;;
        [Ss]) exit_script ;;
        *)
            echo -e "${RED}❌ Opción inválida${NC}"
            sleep 2
            menu_templates
            ;;
    esac
}

menu_expo() {
    banner_principal "HERRAMIENTAS EXPO"
    
    echo -e "${BOLD}OPCIONES DISPONIBLES:${NC}"
    echo ""
    echo -e "  ${CYAN}1)${NC} 🚀 Iniciar Expo Development Server"
    echo -e "  ${CYAN}2)${NC} 🏗️ EAS Build"
    echo ""
    echo -e "  ${CYAN}V)${NC} ⬅️ Volver"
    echo -e "  ${CYAN}S)${NC} 🚪 Salir"
    echo ""
    
    read -p "$(echo -e ${CYAN}"👉 Seleccione una opción: "${NC})" choice
    
    case "$choice" in
        1) 
            echo -e "${YELLOW}⚠️  Función en desarrollo${NC}"
            sleep 2
            menu_expo 
            ;;
        2) 
            echo -e "${YELLOW}⚠️  Función en desarrollo${NC}"
            sleep 2
            menu_expo 
            ;;
        [Vv]) menu ;;
        [Ss]) exit_script ;;
        *)
            echo -e "${RED}❌ Opción inválida${NC}"
            sleep 2
            menu_expo
            ;;
    esac
}

menu_docker_services() {
    banner_principal "ESTADO Y SERVICIOS DOCKER"
    
    echo -e "${BOLD}OPCIONES DISPONIBLES:${NC}"
    echo ""
    echo -e "  ${CYAN}1)${NC} 🔍 Estado Docker Engine"
    echo -e "  ${CYAN}2)${NC} 🖥️ Estado Docker Desktop"
    echo -e "  ${CYAN}3)${NC} 🔄 Reiniciar Docker Engine"
    echo -e "  ${CYAN}4)${NC} 🔄 Reiniciar Docker Desktop"
    echo -e "  ${CYAN}5)${NC} ♻️ Reiniciar Ambos"
    echo ""
    echo -e "  ${CYAN}V)${NC} ⬅️ Volver"
    echo -e "  ${CYAN}S)${NC} 🚪 Salir"
    echo ""
    
    read -p "$(echo -e ${CYAN}"👉 Seleccione una opción: "${NC})" choice
    
    case "$choice" in
        1) 
            docker info
            pause
            menu_docker_services 
            ;;
        2) 
            echo -e "${YELLOW}⚠️  Verifique Docker Desktop manualmente${NC}"
            pause
            menu_docker_services 
            ;;
        3) 
            if confirm_action "¿Reiniciar Docker Engine?" "no"; then
                echo -e "${YELLOW}⚠️  Requiere permisos de administrador${NC}"
                sudo systemctl restart docker 2>/dev/null || echo -e "${RED}❌ No se pudo reiniciar${NC}"
            fi
            pause
            menu_docker_services 
            ;;
        4) 
            echo -e "${YELLOW}⚠️  Reinicie Docker Desktop manualmente${NC}"
            pause
            menu_docker_services 
            ;;
        5) 
            echo -e "${YELLOW}⚠️  Reinicie Docker Engine y Desktop manualmente${NC}"
            pause
            menu_docker_services 
            ;;
        [Vv]) menu ;;
        [Ss]) exit_script ;;
        *)
            echo -e "${RED}❌ Opción inválida${NC}"
            sleep 2
            menu_docker_services
            ;;
    esac
}

menu_portainer() {
    banner_principal "PORTAINER"
    
    echo -e "${BOLD}OPCIONES DISPONIBLES:${NC}"
    echo ""
    echo -e "  ${CYAN}1)${NC} ▶️ Iniciar Portainer"
    echo -e "  ${CYAN}2)${NC} ⏹️ Detener Portainer"
    echo -e "  ${CYAN}3)${NC} 🔄 Reiniciar Portainer"
    echo -e "  ${CYAN}4)${NC} 🌐 Abrir en navegador"
    echo -e "  ${CYAN}5)${NC} 📋 Ver logs"
    echo -e "  ${CYAN}6)${NC} ♻️ Recrear Portainer"
    echo ""
    echo -e "  ${CYAN}V)${NC} ⬅️ Volver"
    echo -e "  ${CYAN}S)${NC} 🚪 Salir"
    echo ""
    
    read -p "$(echo -e ${CYAN}"👉 Seleccione una opción: "${NC})" choice
    
    case "$choice" in
        1) 
            start_portainer
            pause
            menu_portainer 
            ;;
        2) 
            if docker_container_exists "$PORTAINER_NAME"; then
                if named_portainer_container_is_valid; then
                    docker stop "$PORTAINER_NAME" >/dev/null 2>&1 && \
                        echo -e "${GREEN}✅ Portainer detenido${NC}" || \
                        echo -e "${RED}❌ Error al detener${NC}"
                else
                    warn_invalid_named_portainer_container
                fi
            else
                echo -e "${YELLOW}⚠️  No existe un contenedor llamado ${PORTAINER_NAME}.${NC}"
            fi
            pause
            menu_portainer 
            ;;
        3) 
            if docker_container_exists "$PORTAINER_NAME"; then
                if ! named_portainer_container_is_valid; then
                    warn_invalid_named_portainer_container
                elif docker_container_is_running "$PORTAINER_NAME"; then
                    docker restart "$PORTAINER_NAME" >/dev/null 2>&1 && \
                        echo -e "${GREEN}✅ Portainer reiniciado en $(get_portainer_url)${NC}" || \
                        echo -e "${RED}❌ Error al reiniciar${NC}"
                else
                    start_portainer
                fi
            else
                echo -e "${YELLOW}⚠️  No existe un contenedor llamado ${PORTAINER_NAME}. Se intentará crearlo.${NC}"
                start_portainer
            fi
            pause
            menu_portainer 
            ;;
        4) 
            if docker_container_exists "$PORTAINER_NAME"; then
                if named_portainer_container_is_valid; then
                    xdg-open "$(get_portainer_url)" 2>/dev/null || \
                        echo -e "${YELLOW}⚠️  Abra $(get_portainer_url) manualmente${NC}"
                else
                    warn_invalid_named_portainer_container
                fi
            else
                echo -e "${YELLOW}⚠️  No existe un contenedor llamado ${PORTAINER_NAME}.${NC}"
            fi
            pause
            menu_portainer 
            ;;
        5) 
            if docker_container_exists "$PORTAINER_NAME"; then
                if named_portainer_container_is_valid; then
                    docker logs "$PORTAINER_NAME" --tail 50
                else
                    warn_invalid_named_portainer_container
                fi
            else
                echo -e "${YELLOW}⚠️  No existe un contenedor llamado ${PORTAINER_NAME}.${NC}"
            fi
            pause
            menu_portainer 
            ;;
        6) 
            if confirm_action "¿Recrear contenedor Portainer?" "no"; then
                if docker_container_exists "$PORTAINER_NAME" && ! named_portainer_container_is_valid; then
                    warn_invalid_named_portainer_container
                else
                    local target_port=""
                    target_port="$(ensure_portainer_host_port "$PORTAINER_DEFAULT_HOST_PORT" "$PORTAINER_NAME")"
                    if [[ -n "$target_port" ]]; then
                        if recreate_portainer_container "$target_port"; then
                            echo -e "${GREEN}✅ Portainer recreado e iniciado en http://localhost:${target_port}${NC}"
                        else
                            echo -e "${RED}❌ Error al recrear Portainer${NC}"
                        fi
                    fi
                fi
            fi
            pause
            menu_portainer 
            ;;
        [Vv]) menu ;;
        [Ss]) exit_script ;;
        *)
            echo -e "${RED}❌ Opción inválida${NC}"
            sleep 2
            menu_portainer
            ;;
    esac
}

# ==================================================
# FUNCIÓN DE SALIDA
# ==================================================

exit_script() {
    clear
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}   ¡Gracias por usar Docker Tools!${NC}"
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BLUE}Todos los procesos han sido cerrados correctamente.${NC}"
    echo ""
    exit 0
}

# ==================================================
# FUNCIÓN PRINCIPAL
# ==================================================

main() {
    # Limpiar pantalla al inicio
    clear
    
    # Configurar colores
    setup_colors
    
    # Verificar dependencias al inicio (Punto 1)
    check_dependencies
    
    # Variables iniciales
    ENV="dev"
    export ENV
    PROJECT_NAME=$(read_project_name)
    STACK="${PROJECT_NAME:-NoExiteStackName}"
    LABEL_FILTER="stack=${STACK}"
    COMPOSE_FILE=""
    CURRENT_IP=""
    BACKUP_DIR="docker-backups"
    
    # ── AGREGADO: Portainer ──────────────────
    PORTAINER_NAME="portainer"
    PORTAINER_IMAGE="portainer/portainer-ce:2.21.2"
    PORTAINER_DEFAULT_HOST_PORT="9000"
    PORTAINER_CONTAINER_PORT="9000/tcp"
    # ─────────────────────────────────────────

    # Definir archivo compose inicial
    define_compose_file
    
    # Ir al menú principal
    menu
}

# Ejecutar función principal
main "$@"
