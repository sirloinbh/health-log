#!/bin/bash
# Managed file. Edit it in sirloinbh/project-standards templates/app/deploy/
# Installs and starts the pull-based deployment timer. Run as root on the server:
#   sudo bash /opt/health-log/deploy/install-autodeploy.sh
set -euo pipefail
dir=$(cd "$(dirname "$0")" && pwd)
unit=health-autodeploy
install -m 644 "$dir/autodeploy.service" "/etc/systemd/system/$unit.service"
install -m 644 "$dir/autodeploy.timer" "/etc/systemd/system/$unit.timer"
systemctl daemon-reload
systemctl enable --now "$unit.timer"
systemctl list-timers "$unit.timer" --no-pager
