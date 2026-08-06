#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------
# Cloud-init for Arka control plane host.
# Installs Docker Engine, Compose plugin, and Git.
# Hardens SSH and enables UFW as defense-in-depth.
# Does NOT deploy the application; that is a separate lane.
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

echo "arka-control cloud-init complete" | tee /opt/arka/.cloud-init-done
