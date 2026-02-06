# Twoine - Guide de Configuration DNS

## Vue d'ensemble

Ce guide explique comment configurer les DNS pour Twoine. Il existe **deux types de domaines distincts** :

| Type | Usage | Exemple |
|------|-------|---------|
| **Domaine plateforme** | Interface admin/user Twoine | `twoine.exemple.com` |
| **Domaines des sites** | Sites hébergés par Twoine | `monsite.exemple.com` |

---

## 1. Domaine de la Plateforme Twoine

### Quand le configurer ?

- Pendant l'installation (`install.sh`)
- Optionnel : accès possible via IP du serveur

### Configuration DNS requise

Créez un enregistrement DNS de type **A** :

```
Type  : A
Nom   : twoine.exemple.com  (ou sous-domaine de votre choix)
Valeur: IP_PUBLIQUE_DU_SERVEUR
TTL   : 3600 (ou valeur par défaut)
```

### Exemple concret

```
Serveur IP : 203.0.113.50
Domaine    : twoine.mondomaine.fr

Enregistrement DNS :
  Type  : A
  Nom   : twoine
  Valeur: 203.0.113.50
```

Résultat : `https://twoine.mondomaine.fr` pointe vers votre serveur Twoine.

---

## 2. Domaines des Sites Hébergés

### Quand les configurer ?

- **Après** l'installation de Twoine
- Via l'interface admin de Twoine
- Un enregistrement DNS par domaine/sous-domaine

### Configuration DNS requise

Pour chaque site hébergé, créez un enregistrement **A** :

```
Type  : A
Nom   : app (ou @ pour le domaine racine)
Valeur: IP_PUBLIQUE_DU_SERVEUR (même IP que Twoine)
TTL   : 3600
```

### Exemples

**Site 1 - Sous-domaine :**
```
Domaine : app.exemple.com
Type    : A
Nom     : app
Valeur  : 203.0.113.50
```

**Site 2 - Domaine racine :**
```
Domaine : monblog.fr
Type    : A
Nom     : @
Valeur  : 203.0.113.50
```

**Site 2 - Avec www :**
```
Domaine : www.monblog.fr
Type    : CNAME
Nom     : www
Valeur  : monblog.fr
```

---

## 3. Vérification DNS

### Avant l'installation

L'installateur Twoine vérifie automatiquement :
1. Récupère l'IP publique du serveur
2. Résout le domaine fourni
3. Compare les deux valeurs
4. Refuse si mismatch

### Commandes de diagnostic

```bash
# Vérifier l'IP publique du serveur
curl -s https://api.ipify.org

# Résoudre un domaine
dig +short twoine.exemple.com A

# Résolution via différents serveurs DNS
dig @8.8.8.8 +short twoine.exemple.com A
dig @1.1.1.1 +short twoine.exemple.com A

# Vérification complète
nslookup twoine.exemple.com

# Test de connexion
ping -c 4 twoine.exemple.com
```

### Script de diagnostic intégré

Twoine inclut un script de diagnostic DNS :

```bash
# Depuis le serveur
source /opt/twoine/lib/dns-manager.sh
diagnose_dns "twoine.exemple.com"
```

---

## 4. Propagation DNS

### Délais typiques

| Fournisseur | Délai moyen |
|-------------|-------------|
| Cloudflare | 1-5 minutes |
| OVH | 5-15 minutes |
| Gandi | 5-30 minutes |
| GoDaddy | 15-60 minutes |
| Autres | Jusqu'à 48h |

### Vérifier la propagation

Utilisez des outils en ligne :
- https://www.whatsmydns.net/
- https://dnschecker.org/
- https://www.dnswatch.info/

---

## 5. Hostname Linux

### Relation avec le domaine

Le hostname Linux peut être :
- Identique au domaine (`twoine.exemple.com`)
- Différent (`serveur-prod-01`)

### Configuration recommandée

```bash
# Vérifier le hostname actuel
hostname
hostname -f

# Modifier le hostname
sudo hostnamectl set-hostname twoine.exemple.com

# Mettre à jour /etc/hosts
sudo nano /etc/hosts
```

Contenu de `/etc/hosts` :
```
127.0.0.1       localhost
127.0.1.1       twoine.exemple.com twoine
IP_SERVEUR      twoine.exemple.com twoine
```

### Synchronisation automatique

L'installateur Twoine propose de synchroniser le hostname avec le domaine configuré.

---

## 6. Cas Particuliers

### Accès via IP uniquement

Si vous n'avez pas de domaine :
- L'installateur génère un certificat auto-signé
- Accès via `https://IP_SERVEUR`
- Avertissement du navigateur (certificat auto-signé)

### Changement de domaine après installation

1. Configurer le nouveau DNS (enregistrement A)
2. Attendre la propagation
3. Modifier via l'interface admin Twoine
4. Regénérer le certificat SSL

### Plusieurs domaines pour la plateforme

Non supporté actuellement. Utilisez un seul domaine pour l'interface Twoine.

### Wildcard DNS

Non recommandé pour Twoine. Configurez chaque domaine explicitement.

---

## 7. Certificats SSL

### Certificat auto-signé (installation)

- Généré automatiquement
- Valide pour : domaine, localhost, IP serveur
- Durée : 365 jours
- **Avertissement navigateur** : normal

### Let's Encrypt (production)

Configurable via l'interface admin après installation :
1. Vérifier que le DNS est correctement configuré
2. Accéder à Admin > SSL > Nouveau certificat
3. Sélectionner Let's Encrypt
4. Renouvellement automatique

### Certificat personnalisé

Upload via l'interface admin :
- Fichier `.crt` (certificat)
- Fichier `.key` (clé privée)
- Fichier `.ca-bundle` (optionnel, chaîne de certification)

---

## 8. Résolution de Problèmes

### Erreur : "Le domaine ne peut pas être résolu"

**Causes possibles :**
1. Enregistrement DNS non créé
2. Propagation en cours
3. Erreur de frappe dans le domaine

**Solutions :**
```bash
# Vérifier l'enregistrement
dig +short mondomaine.com A

# Si vide, l'enregistrement n'existe pas
# Créez-le chez votre registrar
```

### Erreur : "Le domaine pointe vers une autre IP"

**Causes possibles :**
1. Ancien enregistrement DNS
2. Mauvaise IP configurée
3. CDN/Proxy actif (Cloudflare)

**Solutions :**
```bash
# Vérifier l'IP actuelle
dig +short mondomaine.com A

# Comparer avec l'IP du serveur
curl -s https://api.ipify.org

# Si différent, modifier l'enregistrement DNS
```

### Cloudflare : Mode Proxy Orange

Si vous utilisez Cloudflare avec le proxy activé (nuage orange) :
1. L'IP résolue sera celle de Cloudflare, pas du serveur
2. Option 1 : Désactiver le proxy (nuage gris)
3. Option 2 : Utiliser `--skip-dns-check` lors de l'installation

```bash
sudo ./install.sh --domain=mondomaine.com --skip-dns-check
```

### Timeout lors de la vérification DNS

**Causes possibles :**
1. Firewall bloquant les requêtes DNS sortantes
2. Problème réseau

**Solutions :**
```bash
# Tester la connectivité DNS
dig @8.8.8.8 google.com

# Si timeout, vérifier le firewall
sudo ufw status
```

---

## 9. Bonnes Pratiques

### Sécurité

- ✅ Utilisez HTTPS (Let's Encrypt en production)
- ✅ Gardez les enregistrements DNS à jour
- ✅ Utilisez des TTL courts pendant les migrations
- ❌ Ne partagez pas votre IP publique inutilement

### Performance

- ✅ TTL de 3600s minimum en production
- ✅ Utilisez un CDN pour les sites à fort trafic
- ✅ Configurez les enregistrements CAA pour SSL

### Maintenance

- ✅ Documentez vos enregistrements DNS
- ✅ Surveillez l'expiration des domaines
- ✅ Testez après chaque modification

---

## 10. Récapitulatif des Enregistrements

### Installation Twoine

| Enregistrement | Valeur |
|----------------|--------|
| Type | A |
| Nom | twoine (ou votre choix) |
| Valeur | IP publique du serveur |

### Chaque site hébergé

| Enregistrement | Valeur |
|----------------|--------|
| Type | A |
| Nom | @ ou sous-domaine |
| Valeur | IP publique du serveur (même que Twoine) |

---

## Support

- **Documentation** : https://twoine.io/docs/dns
- **GitHub Issues** : https://github.com/Antoine601/Twoine/issues
