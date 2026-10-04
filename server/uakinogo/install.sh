#!/usr/bin/env bash
# Installs only the Faborn metadata service. Does not configure a video proxy,
# router, firewall or system Node.js.
set -Eeuo pipefail
version='0.1.0-beta.46'
node_version='v24.21.0'
base='/opt/faborn-resolver'
bundle="faborn-uakinogo-${version}.tar.gz"
release="https://github.com/serg-ill/ukr-by-faborn/releases/download/v${version}"
usage() {
    echo "Faborn UAKinogo ${version}: sudo bash install.sh [--port NUMBER] [--test-users] [--allow-lan CIDR|none]"
    echo 'Ubuntu 22.04+ x86_64/arm64, systemd. --test-users creates test1/test2 with private random passwords.'
    echo 'Keeps the configured port when available; otherwise tries the next 20 ports.'
    echo 'An explicit --port never silently selects another port.'
    echo '--allow-lan 192.168.88.0/24 permits that LAN without a password; outside clients still require configured accounts/keys.'
    echo '--allow-lan none removes that exception. Without this flag, the current policy is preserved.'
}
valid_port() { [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 )); }
valid_lan() {
    [[ "$1" == none ]] && return 0
    [[ "$1" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)/([0-9]{1,2})$ ]] || return 1
    local a=${BASH_REMATCH[1]} b=${BASH_REMATCH[2]} c=${BASH_REMATCH[3]} d=${BASH_REMATCH[4]} bits=${BASH_REMATCH[5]} n min=33
    for n in "$a" "$b" "$c" "$d"; do
        [[ "$n" == 0 || "$n" =~ ^[1-9][0-9]{0,2}$ ]] && (( 10#$n <= 255 )) || return 1
    done
    bits=$((10#$bits))
    if (( a == 10 )); then min=8
    elif (( a == 172 && b >= 16 && b <= 31 )); then min=12
    elif (( a == 192 && b == 168 )); then min=16; fi
    (( bits >= min && bits <= 32 )) || return 1
    (( ((a * 16777216 + b * 65536 + c * 256 + d) % (1 << (32 - bits))) == 0 ))
}
write_lan() {
    local file="$1" value="$2" temp
    [[ "$value" != none ]] || value=''
    temp=$(mktemp "${file}.XXXXXX")
    if ! awk -v value="$value" '/^[[:space:]]*FABORN_ALLOW_LAN=/{if (!written++) print "FABORN_ALLOW_LAN=" value; next} {print} END{if (!written) print "FABORN_ALLOW_LAN=" value}' "$file" > "$temp"; then
        rm -f -- "$temp"; return 1
    fi
    chmod 0600 "$temp"; mv -f -- "$temp" "$file"
}
read_port() {
    local value=''
    if [[ -f "$1" ]]; then
        value=$(sed -nE "s/^[[:space:]]*PORT=[\"']?([0-9]+)[\"']?[[:space:]]*$/\1/p" "$1" | tail -n 1)
        if [[ -z "$value" ]] && awk '/^[[:space:]]*PORT=/{found=1} END{exit !found}' "$1"; then
            echo 'Invalid PORT in the existing environment file.' >&2; return 2
        fi
    fi
    value=${value:-8787}
    valid_port "$value" || { echo 'PORT must be between 1 and 65535.' >&2; return 2; }
    printf '%s\n' "$((10#$value))"
}
# ss is run as root so an existing Faborn listener can be identified by MainPID.
# A foreign listener, including one answering /health with 401, is never stopped.
listeners_are_ours() {
    local listeners="$1" pid="$2" line found
    [[ -n "$listeners" && "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
    while IFS= read -r line; do
        found=false
        while [[ "$line" =~ pid=([0-9]+), ]]; do
            [[ "${BASH_REMATCH[1]}" == "$pid" ]] || return 1
            line=${line#*"pid=${BASH_REMATCH[1]},"}; found=true
        done
        [[ "$found" == true ]] || return 1
    done <<< "$listeners"
}
port_available() {
    local listeners
    listeners=$(ss -H -ltnp "sport = :$1") || { echo 'Cannot inspect listening ports with ss.' >&2; return 2; }
    [[ -z "$listeners" ]] || listeners_are_ours "$listeners" "$2"
}
choose_port() {
    local requested="$1" start="$2" pid="$3" candidate status limit
    candidate=${requested:-$start}
    limit=$((candidate + 20)); [[ -z "$requested" ]] || limit=$candidate
    for (( ; candidate <= limit && candidate <= 65535; candidate++ )); do
        if port_available "$candidate" "$pid"; then printf '%s\n' "$candidate"; return 0; else status=$?; fi
        [[ "$status" != 2 ]] || return 2
        echo "Port $candidate is occupied by another service." >&2
    done
    echo 'No available port. Run the installer with --port and an available port number.' >&2
    return 1
}
write_port() {
    local file="$1" value="$2" temp
    temp=$(mktemp "${file}.XXXXXX")
    if ! awk -v value="$value" '/^[[:space:]]*PORT=/{if (!written++) print "PORT=" value; next} {print} END{if (!written) print "PORT=" value}' "$file" > "$temp"; then
        rm -f -- "$temp"; return 1
    fi
    chmod 0600 "$temp"; mv -f -- "$temp" "$file"
}
health_check() {
    local pid listeners
    systemctl is-active --quiet faborn-resolver.service || return 1
    pid=$(systemctl show --property MainPID --value faborn-resolver.service) || return 1
    listeners=$(ss -H -ltnp "sport = :$port") || return 1
    listeners_are_ours "$listeners" "$pid" || return 1
    curl -fsS --max-time 3 "http://127.0.0.1:$port/health" -o "$stage/health.json" || return 1
    "$base/node/bin/node" -e 'const h=JSON.parse(require("fs").readFileSync(process.argv[1]));if(h.ok!==true||h.videoProxy!==false||h.version!==process.argv[2])process.exit(1)' "$stage/health.json" "$version"
}
rollback_install() {
    [[ "$rollback_armed" == true ]] || return 0
    rollback_armed=false
    systemctl stop faborn-resolver.service || true
    if [[ -n "$previous" && -n "$previous_node" && -f "$stage/previous.service" ]]; then
        ln -s "$previous" "$base/current.rollback.$$"; mv -Tf "$base/current.rollback.$$" "$base/current"
        ln -s "$previous_node" "$base/node.rollback.$$"; mv -Tf "$base/node.rollback.$$" "$base/node"
        install -m 0644 "$stage/previous.service" "$service_file"
    else
        # Keep a failed first install available for a subsequent retry, but disabled.
        previous_active=false; previous_enabled=false
    fi
    if [[ -f "$stage/previous.env" ]]; then
        install -m 0600 "$stage/previous.env" "$env_file"
    fi
    systemctl daemon-reload || true
    if [[ "$previous_enabled" == true ]]; then systemctl enable faborn-resolver.service >/dev/null || true; else systemctl disable faborn-resolver.service >/dev/null || true; fi
    if [[ "$previous_active" == true ]]; then systemctl restart faborn-resolver.service || true; fi
    echo 'Restored the previous configuration and service state. Other services were not changed.' >&2
}
main() {
local requested_port='' requested_lan='' test_users=false env_file='/etc/faborn-resolver.env' service_file='/etc/systemd/system/faborn-resolver.service'
local stage='' rollback_armed=false previous='' previous_node='' previous_active=false previous_enabled=false
local configured_port port own_pid=0 healthy=false status
while [[ $# -gt 0 ]]; do
    case "$1" in
        --help) usage; return 0 ;;
        --port)
            [[ $# -ge 2 ]] && valid_port "$2" || { echo '--port requires a number between 1 and 65535.' >&2; return 2; }
            requested_port=$((10#$2)); shift 2 ;;
        --test-users) test_users=true; shift ;;
        --allow-lan)
            [[ $# -ge 2 ]] && valid_lan "$2" || { echo '--allow-lan requires a private IPv4 network, e.g. 192.168.88.0/24, or none.' >&2; return 2; }
            requested_lan=$2; shift 2 ;;
        *) echo 'Unknown argument. Use --help.' >&2; return 2 ;;
    esac
done
[[ $(uname -s) == Linux && -f /etc/os-release ]] || { echo 'Run this script on Ubuntu through SSH, not on the Mac.' >&2; exit 1; }
. /etc/os-release
[[ "$ID" == ubuntu ]] || { echo 'This installer supports Ubuntu.' >&2; exit 1; }
[[ "${VERSION_ID%%.*}" -ge 22 ]] || { echo 'Ubuntu 22.04 or newer is required.' >&2; exit 1; }
[[ $EUID == 0 ]] || { echo 'Run with sudo bash install.sh' >&2; exit 1; }
command -v systemctl >/dev/null || { echo 'systemd is required.' >&2; exit 1; }
case "$(uname -m)" in
    x86_64) arch=x64; node_sha='fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6' ;;
    aarch64|arm64) arch=arm64; node_sha='6ad1325edbdb5649c379b75a237147a666c95d4f9ae8d340fef2d1575d289ad2' ;;
    *) echo 'Only x86_64 and arm64 are supported.' >&2; exit 1 ;;
esac
for cmd in curl xz tar sha256sum ss; do
    if ! command -v "$cmd" >/dev/null; then
        apt-get update -qq
        apt-get install -y --no-install-recommends ca-certificates curl xz-utils iproute2
        break
    fi
done
configured_port=$(read_port "$env_file")
if systemctl is-active --quiet faborn-resolver.service; then
    previous_active=true
    own_pid=$(systemctl show --property MainPID --value faborn-resolver.service)
fi
if systemctl is-enabled --quiet faborn-resolver.service; then previous_enabled=true; fi
port=$(choose_port "$requested_port" "$configured_port" "$own_pid")
echo "Installing Faborn on port $port."
stage=$(mktemp -d)
trap "$(printf 'rm -rf -- %q' "$stage")" EXIT
trap 'status=$?; trap - ERR; rollback_install; exit "$status"' ERR
fetch() { curl --fail --location --show-error --silent --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 240 --retry 2 "$1" -o "$2"; }
fetch "$release/$bundle" "$stage/$bundle"
fetch "$release/$bundle.sha256" "$stage/checksum"
read -r checksum filename < "$stage/checksum"
[[ "$checksum" =~ ^[a-f0-9]{64}$ && "$filename" == "$bundle" ]] || { echo 'Invalid release checksum.' >&2; exit 1; }
printf '%s  %s\n' "$checksum" "$stage/$bundle" | sha256sum -c -
# A dedicated official Node runtime leaves the system Node and other services intact.
node_archive="node-${node_version}-linux-${arch}.tar.xz"
fetch "https://nodejs.org/dist/${node_version}/${node_archive}" "$stage/$node_archive"
printf '%s  %s\n' "$node_sha" "$stage/$node_archive" | sha256sum -c -
mkdir "$stage/app" "$stage/node"
tar -xzf "$stage/$bundle" --no-same-owner --no-same-permissions -C "$stage/app"
tar -xJf "$stage/$node_archive" --no-same-owner --no-same-permissions --strip-components=1 -C "$stage/node"
"$stage/node/bin/node" --check "$stage/app/server/uakinogo/server.js"
"$stage/node/bin/node" --check "$stage/app/server/uakinogo/resolver.js"
"$stage/node/bin/node" --check "$stage/app/server/uakinogo/auth.js"
"$stage/node/bin/node" --check "$stage/app/server/uakinogo/users.js"
"$stage/node/bin/node" -e 'const s=require(process.argv[1]);if(s.VERSION!==process.argv[2])process.exit(1)' "$stage/app/server/uakinogo/server.js" "$version"
# Downloads take time: check again before changing the installed service.
own_pid=0
if systemctl is-active --quiet faborn-resolver.service; then own_pid=$(systemctl show --property MainPID --value faborn-resolver.service); fi
if ! port_available "$port" "$own_pid"; then echo "Port $port became unavailable. No installed configuration was changed; run the installer again." >&2; exit 1; fi
if ! id faborn-resolver >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$base" --no-create-home --shell /usr/sbin/nologin faborn-resolver
fi
install -d -m 0755 "$base/releases" "$base/runtimes"
install -d -m 0700 -o faborn-resolver -g faborn-resolver "$base/auth"
if [[ ! -e "$base/auth/users.json" ]]; then
    install -m 0600 -o faborn-resolver -g faborn-resolver /dev/null "$base/auth/users.json"
    printf '%s\n' '{"version":1,"enabled":false,"users":[]}' > "$base/auth/users.json"
fi
release_dir="$base/releases/${version}-$(date +%s)-$$"
runtime_dir="$base/runtimes/${node_version}-$(date +%s)-$$"
install -d -m 0755 "$release_dir" "$runtime_dir"
cp -R "$stage/app/." "$release_dir/"
cp -R "$stage/node/." "$runtime_dir/"
chown -R root:root "$release_dir" "$runtime_dir"
chmod -R go-w "$release_dir" "$runtime_dir"
[[ ! -e "$env_file" ]] || cp "$env_file" "$stage/previous.env"
previous=$(readlink "$base/current" || true)
previous_node=$(readlink "$base/node" || true)
[[ ! -e "$service_file" ]] || cp "$service_file" "$stage/previous.service"
rollback_armed=true
if [[ ! -e "$env_file" ]]; then
    install -m 0600 /dev/null "$env_file"
    cat > "$env_file" <<'ENV'
HOST=0.0.0.0
PORT=8787
FABORN_ACCESS_KEYS=
ENV
fi
write_port "$env_file" "$port"
if [[ -n "$requested_lan" ]]; then write_lan "$env_file" "$requested_lan"; fi
if ! awk '/^[[:space:]]*FABORN_USERS_FILE=/{found=1} END{exit !found}' "$env_file"; then
    printf '%s\n' "FABORN_USERS_FILE=$base/auth/users.json" >> "$env_file"
fi
if [[ "$test_users" == true ]]; then
    # Custom account locations must be managed explicitly.
    if ! awk -v expected="FABORN_USERS_FILE=$base/auth/users.json" '$0==expected{found=1} END{exit !found}' "$env_file"; then
        echo 'For a custom FABORN_USERS_FILE, use users.js --file PATH test-users.' >&2
        rollback_install; exit 1
    fi
    "$runtime_dir/bin/node" "$release_dir/server/uakinogo/users.js" --file "$base/auth/users.json" test-users
fi
ln -s "$release_dir" "$base/current.next.$$"
mv -Tf "$base/current.next.$$" "$base/current"
ln -s "$runtime_dir" "$base/node.next.$$"
mv -Tf "$base/node.next.$$" "$base/node"
install -m 0644 "$stage/app/server/uakinogo/faborn-resolver.service" "$service_file"
systemctl daemon-reload
systemctl enable faborn-resolver.service >/dev/null
if systemctl restart faborn-resolver.service; then
    for attempt in 1 2 3 4 5; do
        if health_check; then
            healthy=true; break
        fi
        sleep 1
    done
fi
if [[ "$healthy" != true ]]; then
    echo 'The new service did not pass its health check.' >&2
    journalctl -u faborn-resolver.service -n 15 --no-pager >&2 || true
    rollback_install
    exit 1
fi
rollback_armed=false
trap - ERR
cat "$stage/health.json"
printf '\nInstalled %s with automatic startup. Port: %s. Video proxy: disabled.\n' "$version" "$port"
echo 'Enter http://UBUNTU-LAN-IP:'"$port"' in Lampa > ukr by Faborn > UAKinogo · сервер > Сервер UAKinogo.'
echo 'Users: sudo /opt/faborn-resolver/node/bin/node /opt/faborn-resolver/current/server/uakinogo/users.js --help'
echo 'Existing firewall, router and access-key settings were not changed.'
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
