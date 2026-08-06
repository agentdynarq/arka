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

# ---------------------------------------------------------------
# Application repository.
# /opt/arka is a git checkout so deploy/host-release.sh can run
# "git fetch && git checkout <sha>" to pick up the compose files,
# Caddyfile and env file. The repo is public, so no credential is
# embedded here. It is cloned as root then handed to the ubuntu
# user, which is the identity the release pipeline uses over SSM.
# The clone is best effort: on a transient failure cloud-init still
# finishes host hardening and the checkout is redone by hand.
# ---------------------------------------------------------------
git clone --branch main https://github.com/agentdynarq/arka.git /opt/arka || {
  echo "git clone failed; leaving an empty /opt/arka for a manual clone" >&2
  mkdir -p /opt/arka
}
chown -R ubuntu:ubuntu /opt/arka

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

# Postgres and Redis: reachable only from the control plane public IP.
# The Recovery Console connects directly to the Cell data layer to build
# the health map and run the ledger integrity audit. Traffic arrives via
# this Cell's Elastic IP carrying the control plane's public address as
# its source, because the two VPCs have no peering and private addresses
# do not route between them. The security group already restricts these
# ports to the same /32; this host firewall rule matches it so the
# packets are not dropped before they reach the listener.
# CONTROL_PLANE_IP is injected by CDK addUserData() before this script.
ufw allow from "${CONTROL_PLANE_IP}" to any port 5432 proto tcp
ufw allow from "${CONTROL_PLANE_IP}" to any port 6379 proto tcp

ufw --force enable

echo "arka-${CELL_ID} cloud-init complete" | tee /opt/arka/.cloud-init-done
