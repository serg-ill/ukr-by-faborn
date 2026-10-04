#!/usr/bin/env bash
# Installs only the Faborn metadata service. Does not configure a video proxy,
# router, firewall, system Node.js, or access keys.
set -euo pipefail
version='0.1.0-beta.40'
node_version='v24.21.0'
base='/opt/faborn-resolver'
bundle="faborn-uakinogo-${version}.tar.gz"
release="https://github.com/serg-ill/ukr-by-faborn/releases/download/v${version}"
if [[ "${1:-}" == '--help' ]]; then
    echo "Faborn UAKinogo ${version}: sudo bash install.sh"
    echo 'Ubuntu 22.04+ x86_64/arm64, systemd. Port 8787. No access key in this beta.'
    exit 0
fi
[[ $# == 0 ]] || { echo 'Unknown argument. Use --help.' >&2; exit 2; }
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
for cmd in curl xz tar sha256sum; do
    if ! command -v "$cmd" >/dev/null; then
        apt-get update -qq
        apt-get install -y --no-install-recommends ca-certificates curl xz-utils
        break
    fi
done
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
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
"$stage/node/bin/node" -e 'const s=require(process.argv[1]);if(s.VERSION!==process.argv[2])process.exit(1)' "$stage/app/server/uakinogo/server.js" "$version"
if ! id faborn-resolver >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$base" --no-create-home --shell /usr/sbin/nologin faborn-resolver
fi
install -d -m 0755 "$base/releases" "$base/runtimes"
release_dir="$base/releases/${version}-$(date +%s)-$$"
runtime_dir="$base/runtimes/${node_version}-$(date +%s)-$$"
install -d -m 0755 "$release_dir" "$runtime_dir"
cp -R "$stage/app/." "$release_dir/"
cp -R "$stage/node/." "$runtime_dir/"
chown -R root:root "$release_dir" "$runtime_dir"
chmod -R go-w "$release_dir" "$runtime_dir"
if [[ ! -e /etc/faborn-resolver.env ]]; then
    install -m 0600 /dev/null /etc/faborn-resolver.env
    cat > /etc/faborn-resolver.env <<'ENV'
HOST=0.0.0.0
PORT=8787
FABORN_ACCESS_KEYS=
ENV
fi
previous=$(readlink "$base/current" || true)
previous_node=$(readlink "$base/node" || true)
[[ ! -e /etc/systemd/system/faborn-resolver.service ]] || cp /etc/systemd/system/faborn-resolver.service "$stage/previous.service"
ln -s "$release_dir" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
ln -s "$runtime_dir" "$base/node.next"
mv -Tf "$base/node.next" "$base/node"
install -m 0644 "$stage/app/server/uakinogo/faborn-resolver.service" /etc/systemd/system/faborn-resolver.service
systemctl daemon-reload
systemctl enable faborn-resolver.service >/dev/null
healthy=false
if systemctl restart faborn-resolver.service; then
    # Check the configured port without sourcing arbitrary environment-file contents.
    port=$(sed -n 's/^PORT=\([0-9][0-9]*\)$/\1/p' /etc/faborn-resolver.env | tail -n 1)
    port=${port:-8787}
    for attempt in 1 2 3 4 5; do
        if curl -fsS --max-time 3 "http://127.0.0.1:$port/health" -o "$stage/health.json" && "$base/node/bin/node" -e 'const h=JSON.parse(require("fs").readFileSync(process.argv[1]));if(!h.ok||h.videoProxy!==false||h.version!==process.argv[2])process.exit(1)' "$stage/health.json" "$version"; then
            healthy=true; break
        fi
        sleep 1
    done
fi
if [[ "$healthy" != true ]]; then
    echo 'The new service did not pass its health check.' >&2
    journalctl -u faborn-resolver.service -n 15 --no-pager >&2 || true
    systemctl stop faborn-resolver.service || true
    if [[ -n "$previous" && -n "$previous_node" && -f "$stage/previous.service" ]]; then
        ln -s "$previous" "$base/current.rollback"; mv -Tf "$base/current.rollback" "$base/current"
        ln -s "$previous_node" "$base/node.rollback"; mv -Tf "$base/node.rollback" "$base/node"
        install -m 0644 "$stage/previous.service" /etc/systemd/system/faborn-resolver.service
        systemctl daemon-reload; systemctl restart faborn-resolver.service || true
        echo 'Restored the previous service and Node runtime.' >&2
    else
        systemctl disable faborn-resolver.service >/dev/null || true
    fi
    exit 1
fi
cat "$stage/health.json"
printf '\nInstalled %s with automatic startup. Port: %s. Video proxy: disabled.\n' "$version" "$port"
echo 'Enter http://UBUNTU-LAN-IP:'"$port"' in Lampa > ukr by Faborn > Сервер UAKinogo.'
echo 'Existing firewall, router and access-key settings were not changed.'
