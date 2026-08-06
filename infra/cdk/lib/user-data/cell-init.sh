#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------
# Cloud-init for Arka Cell host.
# Identical to control-init.sh plus CELL_ID marker file.
# The CELL_ID environment variable is injected by CDK before
# this script body via instance.addUserData().
# ---------------------------------------------------------------

export DEBIAN_FRONTEND=noninteractive

# System updates
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

# Docker prerequisites
apt-get install -y ca-certificates curl gnupg lsb-release

# Docker official GPG key and repo
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow ubuntu user to run Docker without sudo
usermod -aG docker ubuntu

# Install Git
apt-get install -y git

# Create application directory
mkdir -p /opt/arka
chown ubuntu:ubuntu /opt/arka

# ---------------------------------------------------------------
# Write Cell ID for deploy scripts to reference.
# CELL_ID is set as a shell variable by CDK's addUserData()
# before this script body runs.
# ---------------------------------------------------------------
echo "${CELL_ID}" > /opt/arka/.cell-id
chown ubuntu:ubuntu /opt/arka/.cell-id

# ---------------------------------------------------------------
# SSH hardening
# ---------------------------------------------------------------
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?X11Forwarding.*/X11Forwarding no/' /etc/ssh/sshd_config
systemctl restart sshd

# ---------------------------------------------------------------
# UFW: host-level firewall as defense-in-depth
# ---------------------------------------------------------------
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "arka-${CELL_ID} cloud-init complete" | tee /opt/arka/.cloud-init-done
