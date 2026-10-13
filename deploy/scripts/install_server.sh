#!/usr/bin/env bash
set -euo pipefail
EMAIL="$1"; DOMAIN="$2"
PROJECT=/opt/mathsite

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl gnupg lsb-release \
    ufw nginx certbot python3-certbot-nginx git

# Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# UFW
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# docker log rotation
cat > /etc/docker/daemon.json <<EOF
{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}
EOF
systemctl restart docker

timedatectl set-timezone Europe/Moscow

mkdir -p /var/www/certbot
install -m 644 $PROJECT/deploy/nginx/mathsite-http-only.conf.template /etc/nginx/sites-available/mathsite.conf
sed -i "s|\${DOMAIN}|${DOMAIN}|g" /etc/nginx/sites-available/mathsite.conf
ln -sf /etc/nginx/sites-available/mathsite.conf /etc/nginx/sites-enabled/mathsite.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" -m "$EMAIL" --agree-tos -n

install -m 644 $PROJECT/deploy/nginx/mathsite.conf.template /etc/nginx/sites-available/mathsite.conf
sed -i "s|\${DOMAIN}|${DOMAIN}|g" /etc/nginx/sites-available/mathsite.conf
nginx -t && systemctl reload nginx
systemctl enable --now certbot.timer
