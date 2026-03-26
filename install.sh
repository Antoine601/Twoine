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

echo -e "${CYAN}[1/12]${NC} Vérification du système..."

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
echo -e "${CYAN}[2/12]${NC} Mise à jour des paquets système..."
apt-get update -y
apt-get upgrade -y
echo -e "${GREEN}✔ Paquets système mis à jour${NC}"

# Installation des dépendances système
echo -e "${CYAN}[3/12]${NC} Installation des dépendances système..."
apt-get install -y curl wget gnupg2 ca-certificates lsb-release apt-transport-https software-properties-common build-essential git
echo -e "${GREEN}✔ Dépendances système installées${NC}"

# Vérifier/Installer Node.js
echo -e "${CYAN}[4/12]${NC} Installation de Node.js..."

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
echo -e "${CYAN}[5/12]${NC} Installation de Python..."

if command -v python3 &> /dev/null; then
    echo -e "${GREEN}✔ Python $(python3 --version) détecté${NC}"
else
    echo "Installation de Python 3..."
    apt-get install -y python3 python3-pip python3-venv python3-dev
fi

echo -e "${GREEN}✔ Python $(python3 --version) installé${NC}"

# Vérifier/Installer PHP
echo -e "${CYAN}[6/12]${NC} Installation de PHP..."

if command -v php &> /dev/null; then
    echo -e "${GREEN}✔ PHP $(php --version | head -n 1) détecté${NC}"
else
    echo "Installation de PHP et extensions..."
    apt-get install -y php php-cli php-fpm php-mysql php-pgsql php-mongodb php-curl php-json php-mbstring php-xml php-zip php-gd php-bcmath php-intl
fi

echo -e "${GREEN}✔ PHP $(php --version | head -n 1 | cut -d' ' -f2) installé${NC}"

# Vérifier/Installer MongoDB
echo -e "${CYAN}[7/12]${NC} Installation de MongoDB..."

if command -v mongod &> /dev/null; then
    MONGO_VERSION=$(mongod --version 2>/dev/null | grep 'db version' | cut -d' ' -f3 | cut -d'v' -f2)
    echo -e "${GREEN}✔ MongoDB v${MONGO_VERSION} détecté${NC}"
else
    echo "Détection du support AVX du processeur..."
    
    # Vérifier si le CPU supporte AVX
    if grep -q avx /proc/cpuinfo; then
        echo -e "${GREEN}✔ Support AVX détecté${NC}"
        echo "Installation de MongoDB 7.0 (version moderne)..."
        
        MONGODB_VERSION="7.0"
        
        # Installation des dépendances nécessaires
        apt-get install -y gnupg wget ca-certificates
        
        # Télécharger et ajouter la clé GPG MongoDB 7.0
        curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
        
        # Ajouter le dépôt MongoDB 7.0
        echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
        
        # Mettre à jour les paquets
        apt-get update -y
        
        # Installer MongoDB 7.0
        apt-get install -y mongodb-org
        
    else
        echo -e "${YELLOW}⚠ Support AVX non détecté${NC}"
        echo "Installation de MongoDB 4.4 (compatible sans AVX)..."
        
        MONGODB_VERSION="4.4"
        
        # Installation des dépendances nécessaires
        apt-get install -y gnupg wget ca-certificates
        
        # Sur Ubuntu 22.04, libssl1.1 n'est pas disponible, il faut l'installer manuellement
        if ! dpkg -l | grep -q libssl1.1; then
            echo "Installation de libssl1.1 (requis pour MongoDB 4.4)..."
            
            # Télécharger libssl1.1 depuis les dépôts Ubuntu 20.04
            cd /tmp
            wget http://archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2_amd64.deb
            
            # Installer le paquet
            dpkg -i libssl1.1_1.1.1f-1ubuntu2_amd64.deb
            
            # Nettoyer
            rm -f libssl1.1_1.1.1f-1ubuntu2_amd64.deb
            cd - > /dev/null
            
            echo -e "${GREEN}✔ libssl1.1 installé${NC}"
        fi
        
        # Télécharger et ajouter la clé GPG MongoDB 4.4
        wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-4.4.gpg
        
        # Ajouter le dépôt MongoDB 4.4 (utilise focal car jammy n'est pas supporté par MongoDB 4.4)
        echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-4.4.gpg ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-4.4.list
        
        # Mettre à jour les paquets
        apt-get update -y
        
        # Installer MongoDB 4.4
        apt-get install -y mongodb-org
    fi
    
    # Vérifier que l'installation s'est bien déroulée
    if command -v mongod &> /dev/null; then
        echo -e "${GREEN}✔ MongoDB ${MONGODB_VERSION} installé avec succès${NC}"
        
        # Activer MongoDB au démarrage
        systemctl enable mongod
        
        # Démarrer MongoDB
        systemctl start mongod
        
        # Attendre que MongoDB soit prêt
        sleep 3
        
        # Vérifier que MongoDB est bien démarré
        if systemctl is-active --quiet mongod; then
            echo -e "${GREEN}✔ MongoDB démarré et actif${NC}"
        else
            echo -e "${YELLOW}⚠ MongoDB installé mais le service n'a pas démarré automatiquement${NC}"
            echo "  Vous pouvez le démarrer manuellement avec: sudo systemctl start mongod"
        fi
    else
        echo -e "${RED}✖ Erreur lors de l'installation de MongoDB${NC}"
        echo "  Veuillez vérifier les logs et réessayer"
        exit 1
    fi
fi

echo -e "${GREEN}✔ MongoDB configuré et opérationnel${NC}"

# Vérifier/Installer PostgreSQL
echo -e "${CYAN}[8/12]${NC} Installation de PostgreSQL..."

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
echo -e "${CYAN}[9/12]${NC} Installation de PM2..."

if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✔ PM2 $(pm2 --version) détecté${NC}"
else
    echo "Installation de PM2..."
    npm install -g pm2
    echo -e "${GREEN}✔ PM2 installé${NC}"
fi

# Vérifier/Installer Ollama
echo -e "${CYAN}[10/12]${NC} Installation d'Ollama..."

if command -v ollama &> /dev/null; then
    echo -e "${GREEN}✔ Ollama $(ollama --version) détecté${NC}"
else
    echo "Installation d'Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    echo -e "${GREEN}✔ Ollama installé${NC}"
fi

# Démarrer le service Ollama
systemctl enable ollama 2>/dev/null || true
systemctl start ollama 2>/dev/null || true

# Attendre que Ollama soit prêt
echo "Attente du démarrage d'Ollama..."
sleep 5

# Installer le modèle llama3.2
echo "Installation du modèle llama3.2..."
ollama pull llama3.2 || echo -e "${YELLOW}⚠ Impossible d'installer llama3.2 automatiquement. Vous pourrez l'installer plus tard via l'interface admin.${NC}"

echo -e "${GREEN}✔ Ollama configuré${NC}"

# Copier les fichiers
echo -e "${CYAN}[11/12]${NC} Installation de l'outil..."

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
echo -e "${CYAN}[12/12]${NC} Configuration finale..."

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
echo -e "  • Ollama: $(systemctl is-active ollama 2>/dev/null || echo 'installé')"
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
