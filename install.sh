#!/bin/bash
# ============================================
# Script d'installation - Twoine
# Pour Ubuntu 22.04
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

INSTALL_DIR="/opt/nodejs-project-manager"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════╗"
echo "║     Twoine - Installation                    ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# Vérifier si on est root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✖ Ce script doit être exécuté en tant que root (sudo)${NC}"
    echo "  Usage: sudo ./install.sh"
    exit 1
fi

echo -e "${CYAN}[1/11]${NC} Vérification du système..."

# Vérifier Ubuntu
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        echo -e "${YELLOW}⚠ Ce script est conçu pour Ubuntu. Votre système: $ID${NC}"
        read -p "Continuer quand même ? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    echo -e "${YELLOW}⚠ Impossible de détecter le système d'exploitation${NC}"
fi

echo -e "${GREEN}✔ Système vérifié${NC}"

# Mise à jour des paquets
echo -e "${CYAN}[2/11]${NC} Mise à jour des paquets système..."
apt-get update -y
apt-get upgrade -y
echo -e "${GREEN}✔ Paquets système mis à jour${NC}"

# Installation des dépendances système
echo -e "${CYAN}[3/11]${NC} Installation des dépendances système..."
apt-get install -y curl wget gnupg2 ca-certificates lsb-release apt-transport-https software-properties-common build-essential git
echo -e "${GREEN}✔ Dépendances système installées${NC}"

# Vérifier/Installer Node.js
echo -e "${CYAN}[4/11]${NC} Installation de Node.js..."

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 20 ]; then
        echo -e "${GREEN}✔ Node.js v$(node --version) détecté${NC}"
    else
        echo -e "${YELLOW}⚠ Node.js version $NODE_VERSION détectée, version 20+ requise${NC}"
        echo "Installation de Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi
else
    echo "Installation de Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo -e "${GREEN}✔ Node.js $(node --version) installé${NC}"

# Vérifier/Installer Python
echo -e "${CYAN}[5/11]${NC} Installation de Python..."

if command -v python3 &> /dev/null; then
    echo -e "${GREEN}✔ Python $(python3 --version) détecté${NC}"
else
    echo "Installation de Python 3..."
    apt-get install -y python3 python3-pip python3-venv python3-dev
fi

echo -e "${GREEN}✔ Python $(python3 --version) installé${NC}"

# Vérifier/Installer PHP
echo -e "${CYAN}[6/11]${NC} Installation de PHP..."

if command -v php &> /dev/null; then
    echo -e "${GREEN}✔ PHP $(php --version | head -n 1) détecté${NC}"
else
    echo "Installation de PHP et extensions..."
    apt-get install -y php php-cli php-fpm php-mysql php-pgsql php-mongodb php-curl php-json php-mbstring php-xml php-zip php-gd php-bcmath php-intl
fi

echo -e "${GREEN}✔ PHP $(php --version | head -n 1 | cut -d' ' -f2) installé${NC}"

# Vérifier/Installer MongoDB
echo -e "${CYAN}[7/11]${NC} Installation de MongoDB..."

if command -v mongod &> /dev/null; then
    echo -e "${GREEN}✔ MongoDB $(mongod --version | grep 'db version' | cut -d' ' -f3) détecté${NC}"
else
    echo "Installation de MongoDB..."
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    apt-get update -y
    apt-get install -y mongodb-org
    systemctl enable mongod
    systemctl start mongod
fi

echo -e "${GREEN}✔ MongoDB installé et démarré${NC}"

# Vérifier/Installer PostgreSQL
echo -e "${CYAN}[8/11]${NC} Installation de PostgreSQL..."

if command -v psql &> /dev/null; then
    echo -e "${GREEN}✔ PostgreSQL $(psql --version | cut -d' ' -f3) détecté${NC}"
else
    echo "Installation de PostgreSQL..."
    sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
    apt-get update -y
    apt-get install -y postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql
fi

echo -e "${GREEN}✔ PostgreSQL installé et démarré${NC}"

# Vérifier/Installer PM2
echo -e "${CYAN}[9/11]${NC} Installation de PM2..."

if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✔ PM2 $(pm2 --version) détecté${NC}"
else
    echo "Installation de PM2..."
    npm install -g pm2
    echo -e "${GREEN}✔ PM2 installé${NC}"
fi

# Copier les fichiers
echo -e "${CYAN}[10/11]${NC} Installation de l'outil..."

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
    # Créer le dossier d'installation
    mkdir -p "$INSTALL_DIR"
    
    # Copier les fichiers
    cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"
    
    echo -e "${GREEN}✔ Fichiers copiés vers $INSTALL_DIR${NC}"
else
    echo -e "${GREEN}✔ Déjà dans le dossier d'installation${NC}"
fi

# Installer les dépendances Node.js
cd "$INSTALL_DIR"
npm install --production

echo -e "${GREEN}✔ Dépendances Node.js installées${NC}"

# Créer le lien symbolique
echo -e "${CYAN}[11/11]${NC} Configuration finale..."

chmod +x "$INSTALL_DIR/src/index.js"

# Supprimer l'ancien lien s'il existe
rm -f /usr/local/bin/project-manager

# Créer le nouveau lien
ln -s "$INSTALL_DIR/src/index.js" /usr/local/bin/project-manager

echo -e "${GREEN}✔ Lien symbolique créé: /usr/local/bin/project-manager${NC}"

# Créer les dossiers nécessaires
mkdir -p /etc/nodejs-project-manager
mkdir -p /var/log/nodejs-project-manager
mkdir -p /var/www

echo -e "${GREEN}✔ Dossiers créés${NC}"

# Configurer PM2 au démarrage
echo ""
echo -e "${YELLOW}Configuration de PM2 au démarrage...${NC}"
pm2 startup systemd -u root --hp /root 2>/dev/null || true
pm2 save 2>/dev/null || true

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Installation terminée !              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Services installés:${NC}"
echo -e "  • Node.js: $(node --version)"
echo -e "  • Python: $(python3 --version 2>&1 | cut -d' ' -f2)"
echo -e "  • PHP: $(php --version 2>&1 | head -n 1 | cut -d' ' -f2)"
echo -e "  • MongoDB: $(systemctl is-active mongod)"
echo -e "  • PostgreSQL: $(systemctl is-active postgresql)"
echo -e "  • PM2: $(pm2 --version)"
echo ""
echo -e "${CYAN}Pour lancer l'outil:${NC}"
echo -e "  ${YELLOW}sudo project-manager${NC}"
echo ""
echo -e "${CYAN}Ou directement:${NC}"
echo -e "  ${YELLOW}sudo node $INSTALL_DIR/src/index.js${NC}"
echo ""
echo -e "${CYAN}Gestion des services:${NC}"
echo -e "  • MongoDB: ${YELLOW}sudo systemctl {start|stop|restart|status} mongod${NC}"
echo -e "  • PostgreSQL: ${YELLOW}sudo systemctl {start|stop|restart|status} postgresql${NC}"
echo ""
