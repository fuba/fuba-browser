#!/bin/bash
#
# fuba-browser.sh - Launcher script for fuba-browser Docker container
#
# Usage:
#   ./fuba-browser.sh start [options]   Start the container
#   ./fuba-browser.sh stop [name]       Stop the container
#   ./fuba-browser.sh restart [options] Restart the container
#   ./fuba-browser.sh update [options]  Update to latest image and restart
#   ./fuba-browser.sh status [name]     Show container status
#   ./fuba-browser.sh logs [name]       Show container logs
#   ./fuba-browser.sh pull              Pull the latest image
#   ./fuba-browser.sh version           Show current and latest version

set -e

# Configuration (environment variables)
IMAGE_NAME="${FBB_IMAGE:-ghcr.io/fuba/fuba-browser}"
IMAGE_TAG="${FBB_TAG:-latest}"
SHM_SIZE="${FBB_SHM_SIZE:-2g}"
AUTO_UPDATE="${FBB_AUTO_UPDATE:-true}"
VNC_PASSWORD="${FBB_VNC_PASSWORD:-fuba-browser}"

# Default values for arguments
DEFAULT_CONTAINER_NAME="fuba-browser"
DEFAULT_API_PORT="39000"
DEFAULT_VNC_WEB_PORT="39001"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get the digest of a local image
get_local_digest() {
    docker images --digests --format "{{.Digest}}" "${IMAGE_NAME}:${IMAGE_TAG}" 2>/dev/null | head -n1
}

# Get the digest of the remote image
get_remote_digest() {
    docker manifest inspect "${IMAGE_NAME}:${IMAGE_TAG}" 2>/dev/null | grep -o '"digest": "[^"]*"' | head -n1 | cut -d'"' -f4
}

# Check if update is available
check_update() {
    print_info "Checking for updates..."

    local local_digest=$(get_local_digest)
    local remote_digest=$(get_remote_digest)

    if [ -z "$local_digest" ]; then
        print_warning "No local image found"
        return 0  # Update available (need to pull)
    fi

    if [ -z "$remote_digest" ]; then
        print_warning "Could not check remote image"
        return 1  # Cannot determine
    fi

    if [ "$local_digest" != "$remote_digest" ]; then
        print_warning "Update available!"
        echo "  Local:  ${local_digest:0:20}..."
        echo "  Remote: ${remote_digest:0:20}..."
        return 0  # Update available
    else
        print_success "Image is up to date"
        return 1  # No update
    fi
}

# Pull the latest image
pull_image() {
    print_info "Pulling ${IMAGE_NAME}:${IMAGE_TAG}..."
    docker pull "${IMAGE_NAME}:${IMAGE_TAG}"
    print_success "Image pulled successfully"
}

# Check if container exists
container_exists() {
    local name="$1"
    docker ps -a --format '{{.Names}}' | grep -q "^${name}$"
}

# Check if container is running
container_running() {
    local name="$1"
    docker ps --format '{{.Names}}' | grep -q "^${name}$"
}

# Parse start/restart/update arguments
parse_start_args() {
    CONTAINER_NAME="$DEFAULT_CONTAINER_NAME"
    API_PORT="$DEFAULT_API_PORT"
    VNC_WEB_PORT="$DEFAULT_VNC_WEB_PORT"
    VNC_PORT=""  # Not exposed by default

    while [[ $# -gt 0 ]]; do
        case $1 in
            -n|--name)
                CONTAINER_NAME="$2"
                shift 2
                ;;
            -p|--api-port)
                API_PORT="$2"
                shift 2
                ;;
            -w|--vnc-web-port)
                VNC_WEB_PORT="$2"
                shift 2
                ;;
            -v|--vnc-port)
                VNC_PORT="$2"
                shift 2
                ;;
            -t|--tag)
                IMAGE_TAG="$2"
                shift 2
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

# Start the container
start_container() {
    parse_start_args "$@"

    if container_running "$CONTAINER_NAME"; then
        print_warning "Container '${CONTAINER_NAME}' is already running"
        show_access_info
        return 0
    fi

    # Check for updates if AUTO_UPDATE is enabled
    if [ "$AUTO_UPDATE" = "true" ]; then
        if check_update; then
            pull_image
        fi
    fi

    # Check if image exists locally
    if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "^${IMAGE_NAME}:${IMAGE_TAG}$"; then
        print_info "Image not found locally, pulling..."
        pull_image
    fi

    # Remove existing stopped container
    if container_exists "$CONTAINER_NAME"; then
        print_info "Removing stopped container..."
        docker rm "${CONTAINER_NAME}" >/dev/null
    fi

    print_info "Starting container '${CONTAINER_NAME}'..."

    # Build port arguments
    local port_args="-p ${API_PORT}:39000 -p ${VNC_WEB_PORT}:6080"
    if [ -n "$VNC_PORT" ]; then
        port_args="$port_args -p ${VNC_PORT}:5900"
    fi

    docker run -d \
        --name "${CONTAINER_NAME}" \
        $port_args \
        -e "VNC_PASSWORD=${VNC_PASSWORD}" \
        --shm-size="${SHM_SIZE}" \
        "${IMAGE_NAME}:${IMAGE_TAG}"

    print_success "Container started successfully"
    show_access_info
}

# Stop the container
stop_container() {
    local name="${1:-$DEFAULT_CONTAINER_NAME}"

    if ! container_running "$name"; then
        print_warning "Container '${name}' is not running"
        return 0
    fi

    print_info "Stopping container '${name}'..."
    docker stop "${name}" >/dev/null
    print_success "Container stopped"
}

# Restart the container
restart_container() {
    # Parse args to get container name
    local args=("$@")
    parse_start_args "$@"
    local name="$CONTAINER_NAME"

    # Stop if running
    if container_running "$name"; then
        stop_container "$name"
    fi

    # Remove old container
    if container_exists "$name"; then
        docker rm "$name" >/dev/null
    fi

    # Start with same args
    start_container "${args[@]}"
}

# Update and restart
update_container() {
    # Parse args to get container name
    local args=("$@")
    parse_start_args "$@"
    local name="$CONTAINER_NAME"

    print_info "Updating fuba-browser..."

    local was_running=false
    if container_running "$name"; then
        was_running=true
        stop_container "$name"
    fi

    pull_image

    if [ "$was_running" = true ]; then
        # Remove old container
        if container_exists "$name"; then
            docker rm "$name" >/dev/null
        fi
        start_container "${args[@]}"
    else
        print_info "Image updated. Run 'fuba-browser start' to start the container."
    fi
}

# Show container status
show_status() {
    local name="${1:-$DEFAULT_CONTAINER_NAME}"

    echo "=== fuba-browser Status ==="
    echo ""

    # Image info
    echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"
    local local_digest=$(get_local_digest)
    if [ -n "$local_digest" ]; then
        echo "Local digest: ${local_digest:0:30}..."
    else
        echo "Local image: Not found"
    fi
    echo ""

    # Container status
    if container_running "$name"; then
        echo -e "Container '${name}': ${GREEN}Running${NC}"
        docker ps --filter "name=^${name}$" --format "table {{.Status}}\t{{.Ports}}"
    elif container_exists "$name"; then
        echo -e "Container '${name}': ${YELLOW}Stopped${NC}"
    else
        echo -e "Container '${name}': ${RED}Not created${NC}"
    fi
    echo ""

    # Check for updates
    check_update || true
}

# Show container logs
show_logs() {
    local name="${1:-$DEFAULT_CONTAINER_NAME}"

    if ! container_exists "$name"; then
        print_error "Container '${name}' does not exist"
        exit 1
    fi

    docker logs -f "${name}"
}

# Show version info
show_version() {
    echo "=== Version Info ==="
    echo ""
    echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"

    local local_digest=$(get_local_digest)
    if [ -n "$local_digest" ]; then
        echo "Local: ${local_digest}"
    else
        echo "Local: Not installed"
    fi

    local remote_digest=$(get_remote_digest)
    if [ -n "$remote_digest" ]; then
        echo "Remote: ${remote_digest}"
    else
        echo "Remote: Could not fetch"
    fi
}

# Show access information
show_access_info() {
    echo ""
    echo "=== Access Points ==="
    echo "  REST API: http://localhost:${API_PORT}"
    echo "  Web VNC:  http://localhost:${VNC_WEB_PORT}"
    if [ -n "$VNC_PORT" ]; then
        echo "  VNC:      vnc://localhost:${VNC_PORT} (password: ${VNC_PASSWORD})"
    fi
    echo ""
}

# Install to /usr/local/bin
install_script() {
    local install_path="${1:-/usr/local/bin/fuba-browser}"
    local script_path="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

    print_info "Installing to ${install_path}..."

    if [ -f "$install_path" ]; then
        print_warning "File already exists at ${install_path}"
        read -p "Overwrite? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Installation cancelled"
            return 1
        fi
    fi

    # Check if we need sudo
    local install_dir=$(dirname "$install_path")
    if [ -w "$install_dir" ]; then
        cp "$script_path" "$install_path"
        chmod +x "$install_path"
    else
        print_info "Requires sudo to install to ${install_dir}"
        sudo cp "$script_path" "$install_path"
        sudo chmod +x "$install_path"
    fi

    print_success "Installed to ${install_path}"
    echo "You can now run: fuba-browser start"
}

# Uninstall from /usr/local/bin
uninstall_script() {
    local install_path="${1:-/usr/local/bin/fuba-browser}"

    if [ ! -f "$install_path" ]; then
        print_error "File not found: ${install_path}"
        return 1
    fi

    print_info "Uninstalling from ${install_path}..."

    local install_dir=$(dirname "$install_path")
    if [ -w "$install_dir" ]; then
        rm "$install_path"
    else
        print_info "Requires sudo to uninstall from ${install_dir}"
        sudo rm "$install_path"
    fi

    print_success "Uninstalled from ${install_path}"
}

# Show usage
show_usage() {
    cat << 'EOF'
fuba-browser.sh - Launcher script for fuba-browser Docker container

Usage: fuba-browser <command> [options]

Commands:
  start [options]   Start the container
  stop [name]       Stop the container
  restart [options] Restart the container
  update [options]  Update to latest image and restart
  status [name]     Show container and image status
  logs [name]       Show container logs (follow mode)
  pull              Pull the latest image
  version           Show version information
  install [path]    Install this script to /usr/local/bin
  uninstall [path]  Remove script from /usr/local/bin
  help              Show this help message

Options for start/restart/update:
  -n, --name <name>         Container name (default: fuba-browser)
  -p, --api-port <port>     API port (default: 39000)
  -w, --vnc-web-port <port> Web VNC port (default: 39001)
  -v, --vnc-port <port>     VNC port (not exposed by default)
  -t, --tag <tag>           Image tag (default: latest)

Environment Variables:
  FBB_IMAGE         Image name (default: ghcr.io/fuba/fuba-browser)
  FBB_TAG           Image tag (default: latest)
  FBB_SHM_SIZE      Shared memory size (default: 2g)
  FBB_AUTO_UPDATE   Auto-update on start (default: true)
  FBB_VNC_PASSWORD  VNC password (default: fuba-browser)

Examples:
  # Start with default settings
  fuba-browser start

  # Start with custom name and ports (for multiple instances)
  fuba-browser start -n browser1 -p 39000 -w 39001
  fuba-browser start -n browser2 -p 39100 -w 39101

  # Start with VNC port exposed
  fuba-browser start -v 5900

  # Use specific version
  fuba-browser start -t 1.0.0

  # Stop specific instance
  fuba-browser stop browser1

  # Update all instances
  fuba-browser update -n browser1
  fuba-browser update -n browser2

  # Disable auto-update
  FBB_AUTO_UPDATE=false fuba-browser start

EOF
}

# Main
case "${1:-}" in
    start)
        shift
        start_container "$@"
        ;;
    stop)
        shift
        stop_container "$@"
        ;;
    restart)
        shift
        restart_container "$@"
        ;;
    update)
        shift
        update_container "$@"
        ;;
    status)
        shift
        show_status "$@"
        ;;
    logs)
        shift
        show_logs "$@"
        ;;
    pull)
        pull_image
        ;;
    version)
        show_version
        ;;
    install)
        shift
        install_script "$@"
        ;;
    uninstall)
        shift
        uninstall_script "$@"
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
