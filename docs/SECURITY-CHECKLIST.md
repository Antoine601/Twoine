# 🔐 Twoine - Checklist Sécurité Production

## Vue d'ensemble

Ce document fournit une checklist complète pour sécuriser une installation Twoine en production.

---

## ✅ Checklist Pré-Déploiement

### Système

- [ ] Ubuntu 22.04 LTS installé
- [ ] Système mis à jour (`apt update && apt upgrade`)
- [ ] Partitions séparées pour `/var` et `/opt` (recommandé)
- [ ] Swap configuré si RAM < 2GB

### Réseau

- [ ] IP statique configurée
- [ ] DNS configuré correctement
- [ ] Accès SSH fonctionnel avec clé

---

## ✅ Checklist Firewall (UFW)

```bash
# Vérifier le statut
sudo ufw status verbose
```

- [ ] UFW installé et activé
- [ ] Politique par défaut: deny incoming, allow outgoing
- [ ] Port 22 (SSH) autorisé
- [ ] Port 80 (HTTP) autorisé
- [ ] Port 443 (HTTPS) autorisé
- [ ] Aucun autre port ouvert inutilement

### Configuration Recommandée

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw enable
```

---

## ✅ Checklist SSH

```bash
# Vérifier la configuration
sudo sshd -T | grep -E "(passwordauthentication|permitrootlogin|maxauthtries)"
```

- [ ] Authentification par mot de passe désactivée
- [ ] Authentification par clé activée
- [ ] Root login désactivé ou restreint (`prohibit-password`)
- [ ] MaxAuthTries ≤ 3
- [ ] Clés SSH configurées pour tous les administrateurs
- [ ] Port SSH non-standard (optionnel, sécurité par obscurité)

### Configuration Recommandée

Fichier `/etc/ssh/sshd_config.d/99-security.conf`:

```
PasswordAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
MaxSessions 5
X11Forwarding no
AllowTcpForwarding no
```

---

## ✅ Checklist Fail2ban

```bash
# Vérifier le statut
sudo fail2ban-client status
```

- [ ] Fail2ban installé et actif
- [ ] Jail SSH activée
- [ ] Jail Nginx activée
- [ ] Ban time configuré (recommandé: 1h minimum)
- [ ] Alertes email configurées (optionnel)

---

## ✅ Checklist MongoDB

```bash
# Vérifier le binding
grep -E "bindIp|bind_ip" /etc/mongod.conf
```

- [ ] MongoDB écoute uniquement sur localhost (127.0.0.1)
- [ ] Authentification activée
- [ ] Utilisateur dédié pour Twoine créé
- [ ] Pas d'accès root MongoDB depuis l'application
- [ ] Backups automatiques configurés

---

## ✅ Checklist Nginx

```bash
# Tester la configuration
sudo nginx -t
```

- [ ] Configuration valide
- [ ] Headers de sécurité configurés
- [ ] Rate limiting actif
- [ ] Gzip activé
- [ ] SSL/TLS configuré
- [ ] Redirection HTTP → HTTPS
- [ ] Logs séparés pour Twoine
- [ ] Accès aux fichiers sensibles bloqué

### Headers de Sécurité Requis

| Header | Valeur |
|--------|--------|
| X-Frame-Options | SAMEORIGIN |
| X-Content-Type-Options | nosniff |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |
| Content-Security-Policy | (configuré) |

---

## ✅ Checklist SSL/TLS

```bash
# Vérifier le certificat
openssl x509 -in /opt/twoine/ssl/twoine.crt -text -noout | grep -E "(Subject:|Not After)"
```

- [ ] Certificat SSL valide
- [ ] Certificat non expiré (>30 jours restants)
- [ ] TLS 1.2+ uniquement
- [ ] Ciphers forts configurés
- [ ] HSTS activé (après tests)

### Pour Production

- [ ] Certificat Let's Encrypt ou CA reconnu
- [ ] Renouvellement automatique configuré
- [ ] OCSP Stapling activé

---

## ✅ Checklist Permissions

```bash
# Vérifier les permissions
ls -la /opt/twoine/
stat -c "%a %U:%G %n" /opt/twoine/app/.env
```

| Chemin | Permissions | Propriétaire |
|--------|-------------|--------------|
| `/opt/twoine` | 750 | twoine:twoine |
| `/opt/twoine/config` | 700 | twoine:twoine |
| `/opt/twoine/ssl` | 700 | twoine:twoine |
| `/opt/twoine/ssl/twoine.key` | 600 | twoine:twoine |
| `/opt/twoine/app/.env` | 600 | twoine:twoine |
| `/var/www/twoine` | 750 | twoine:twoine |
| `/var/log/twoine` | 750 | twoine:twoine |

---

## ✅ Checklist Services

```bash
# Vérifier les services
systemctl status twoine-api mongod nginx
```

- [ ] Tous les services Twoine actifs
- [ ] MongoDB actif
- [ ] Nginx actif
- [ ] Aucun service ne tourne en root
- [ ] Redémarrage automatique configuré (Restart=always)

---

## ✅ Checklist Application

```bash
# Tester l'API
curl -k https://localhost/api/health
```

- [ ] API répond sur /api/health
- [ ] JWT secret fort (≥64 caractères)
- [ ] Session secret fort
- [ ] NODE_ENV=production
- [ ] Logs de production configurés
- [ ] Rate limiting actif côté application

### Variables d'Environnement Critiques

| Variable | Vérification |
|----------|--------------|
| JWT_SECRET | ≥64 caractères, aléatoire |
| SESSION_SECRET | ≥64 caractères, aléatoire |
| NODE_ENV | production |
| MONGODB_URI | localhost uniquement |

---

## ✅ Checklist Mises à Jour

- [ ] Mises à jour automatiques de sécurité (unattended-upgrades)
- [ ] Script twoine-update fonctionnel
- [ ] Procédure de rollback testée
- [ ] Backups avant mise à jour

---

## ✅ Checklist Backups

```bash
# Vérifier les backups
ls -la /opt/twoine/backups/
```

- [ ] Backups automatiques configurés (cron)
- [ ] Rétention configurée (30 jours recommandé)
- [ ] Copie vers stockage externe (recommandé)
- [ ] Restauration testée

---

## ✅ Checklist Monitoring

- [ ] Logs centralisés
- [ ] Rotation des logs configurée (logrotate)
- [ ] Health checks automatiques
- [ ] Alertes configurées (optionnel)

---

## ✅ Checklist Sites Utilisateurs

- [ ] Chaque site a son propre utilisateur Linux
- [ ] Isolation SFTP (chroot)
- [ ] Permissions restrictives par site
- [ ] Quotas disque configurés (optionnel)
- [ ] Services isolés par site

---

## 🔍 Commandes de Vérification

### Vérification Complète

```bash
sudo twoine-validate
```

### Vérification Manuelle Rapide

```bash
# Services
systemctl is-active twoine-api mongod nginx

# Firewall
sudo ufw status

# Permissions
stat -c "%a" /opt/twoine/app/.env

# SSL
openssl x509 -enddate -noout -in /opt/twoine/ssl/twoine.crt

# Ports ouverts
ss -tlnp | grep LISTEN

# Processus root
ps aux | grep twoine | grep -v grep
```

---

## 🚨 Actions en Cas de Compromission

1. **Isoler** : Désactiver l'accès réseau si possible
2. **Sauvegarder** : Créer une copie des logs avant modification
3. **Analyser** : Examiner les logs d'accès et d'erreur
4. **Réinitialiser** : Changer tous les secrets (JWT, session, mots de passe)
5. **Mettre à jour** : Appliquer les dernières mises à jour
6. **Documenter** : Noter les actions prises et les découvertes

---

## 📚 Ressources

- [Guide Sécurité Ubuntu](https://ubuntu.com/security)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [OWASP Security Guidelines](https://owasp.org/www-project-web-security-testing-guide/)
