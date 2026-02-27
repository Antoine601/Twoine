# Intégration IA - Twoine

## Vue d'ensemble

Twoine intègre maintenant **Ollama** pour fournir des capacités d'intelligence artificielle à vos projets via une API sécurisée.

### Fonctionnalités

✅ **Gestion des modèles IA** (Admin uniquement)
- Visualiser les modèles installés
- Installer de nouveaux modèles depuis ollama.com/library
- Supprimer des modèles
- Voir les détails et la taille des modèles

✅ **Gestion des clés API**
- Créer des clés API avec rate limiting
- Associer des clés à plusieurs projets
- Monitorer l'utilisation en temps réel
- Révoquer ou régénérer des clés

✅ **API Proxy sécurisée**
- Authentification par clé API
- Rate limiting (requêtes/minute)
- Support du streaming
- Compatible OpenAI format

---

## Installation

### Nouvelle installation

Lors de l'installation de Twoine, Ollama et le modèle `llama3.2` seront automatiquement installés :

```bash
sudo ./install.sh
```

### Installation manuelle d'Ollama

Si Ollama n'est pas installé :

```bash
curl -fsSL https://ollama.com/install.sh | sh
systemctl enable ollama
systemctl start ollama
```

Installer un modèle :

```bash
ollama pull llama3.2
```

---

## Utilisation Admin

### 1. Accéder à la section IA

Dans le panel admin, vous trouverez deux nouvelles sections :

#### **Modèles IA** (`/admin/ai-models`)
- Liste des modèles installés avec leur taille
- Bouton "Installer un modèle" pour parcourir la bibliothèque Ollama
- Actions : Voir détails, Supprimer

#### **Clés API** (`/admin/api-keys`)
- Liste de toutes les clés API créées
- Créer une nouvelle clé
- Actions : Éditer, Révoquer, Régénérer, Voir l'utilisation

### 2. Créer une clé API

1. Aller dans **Clés API** > **Nouvelle clé**
2. Remplir le formulaire :
   - **Nom** : Nom descriptif (ex: "Production API")
   - **Modèle** : Sélectionner un modèle installé
   - **Projets** : Sélectionner les projets autorisés
   - **Limite** : Requêtes par minute (défaut: 10)
3. Cliquer sur **Créer**
4. **Important** : Copier la clé générée immédiatement (format: `twn_...`)

### 3. Installer de nouveaux modèles

1. Aller dans **Modèles IA** > **Installer un modèle**
2. Parcourir la liste des modèles disponibles
3. Cliquer sur **Installer** pour le modèle souhaité
4. Attendre la fin du téléchargement

**Modèles populaires** :
- `llama3.2` - Modèle général performant (recommandé)
- `mistral` - Modèle rapide et efficace
- `codellama` - Spécialisé pour le code
- `qwen2.5-coder` - Excellent pour la programmation

---

## Utilisation Développeur

### Accès aux clés API dans les projets

Dans chaque projet, vous verrez une section **"Clés API"** (similaire aux bases de données et SFTP) qui affiche :
- Les clés API associées au projet
- Un lien rapide vers la gestion des clés

### Faire des requêtes à l'API

#### Exemple JavaScript

```javascript
const API_KEY = 'twn_votre_cle_api';

async function askAI(question) {
  const response = await fetch('https://votre-domaine.com/api/ai/chat', {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: question }
      ]
    })
  });
  
  const data = await response.json();
  return data.message.content;
}

// Utilisation
const answer = await askAI('Quelle est la capitale de la France?');
console.log(answer);
```

#### Exemple Python

```python
import requests

API_KEY = 'twn_votre_cle_api'

def ask_ai(question):
    response = requests.post(
        'https://votre-domaine.com/api/ai/chat',
        json={
            'messages': [
                {'role': 'user', 'content': question}
            ]
        },
        headers={'X-API-Key': API_KEY}
    )
    return response.json()['message']['content']

# Utilisation
answer = ask_ai('Quelle est la capitale de la France?')
print(answer)
```

#### Exemple PHP

```php
<?php
$apiKey = 'twn_votre_cle_api';

function askAI($question) {
    global $apiKey;
    
    $ch = curl_init('https://votre-domaine.com/api/ai/chat');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'X-API-Key: ' . $apiKey,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'messages' => [
            ['role' => 'user', 'content' => $question]
        ]
    ]));
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    $data = json_decode($response, true);
    return $data['message']['content'];
}

// Utilisation
$answer = askAI('Quelle est la capitale de la France?');
echo $answer;
?>
```

---

## Endpoints API

### Chat (Conversationnel)

**POST** `/api/ai/chat`

```json
{
  "messages": [
    {"role": "system", "content": "Tu es un assistant utile."},
    {"role": "user", "content": "Bonjour!"}
  ],
  "stream": false
}
```

### Generate (Completion simple)

**POST** `/api/ai/generate`

```json
{
  "prompt": "Écris un poème sur les montagnes",
  "stream": false
}
```

**Documentation complète** : Voir `API_DOCUMENTATION.md`

---

## Gestion et Monitoring

### Voir l'utilisation d'une clé

1. Aller dans **Clés API**
2. Cliquer sur l'icône "Statistiques" d'une clé
3. Voir l'historique des requêtes avec :
   - Timestamp
   - Endpoint utilisé
   - Modèle
   - Nombre de messages

### Rate Limiting

Chaque clé a une limite configurable de requêtes par minute. Lorsque la limite est atteinte :

```json
{
  "success": false,
  "error": "Limite de 10 requêtes par minute atteinte"
}
```

**Code HTTP** : `429 Too Many Requests`

### Révoquer une clé

1. Aller dans **Clés API**
2. Cliquer sur **Éditer**
3. Changer le statut à **"Désactivée"**
4. Sauvegarder

### Régénérer une clé

1. Aller dans **Clés API**
2. Cliquer sur **Régénérer**
3. Copier la nouvelle clé
4. Mettre à jour vos applications

---

## Sécurité

### ⚠️ Bonnes pratiques

1. **Ne jamais exposer les clés API** dans le code frontend
2. **Utiliser HTTPS** pour toutes les requêtes
3. **Stocker les clés** dans des variables d'environnement
4. **Limiter les projets** associés à chaque clé
5. **Monitorer l'utilisation** régulièrement
6. **Régénérer les clés** compromises immédiatement

### Variables d'environnement

```bash
# .env
TWOINE_API_KEY=twn_votre_cle_api
TWOINE_API_URL=https://votre-domaine.com
```

```javascript
// Utilisation
const apiKey = process.env.TWOINE_API_KEY;
```

---

## Dépannage

### Ollama n'est pas accessible

Vérifier le statut du service :

```bash
systemctl status ollama
```

Redémarrer Ollama :

```bash
systemctl restart ollama
```

### Erreur "Clé API invalide"

- Vérifier que la clé commence par `twn_`
- Vérifier que la clé est active (statut)
- Vérifier que le projet est associé à la clé

### Erreur "Limite atteinte"

- Augmenter la limite dans les paramètres de la clé
- Attendre 1 minute avant de réessayer
- Créer une clé dédiée avec une limite plus élevée

### Modèle non trouvé

Vérifier que le modèle est installé :

```bash
ollama list
```

Installer le modèle manquant :

```bash
ollama pull nom-du-modele
```

---

## Exemples d'utilisation avancés

### Chatbot avec historique

```javascript
const conversationHistory = [];

async function chat(userMessage) {
  conversationHistory.push({
    role: 'user',
    content: userMessage
  });
  
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: conversationHistory
    })
  });
  
  const data = await response.json();
  const assistantMessage = data.message.content;
  
  conversationHistory.push({
    role: 'assistant',
    content: assistantMessage
  });
  
  return assistantMessage;
}
```

### Streaming de réponse

```javascript
async function streamChat(question) {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: question }],
      stream: true
    })
  });
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const data = JSON.parse(line);
      if (data.message?.content) {
        process.stdout.write(data.message.content);
      }
    }
  }
}
```

---

## Ressources

- **Documentation API complète** : `API_DOCUMENTATION.md`
- **Documentation Ollama** : https://ollama.com/docs
- **Bibliothèque de modèles** : https://ollama.com/library
- **Support Twoine** : https://github.com/Antoine601/Twoine/issues

---

## Roadmap

- [ ] Support de l'embeddings pour RAG
- [ ] Interface de chat intégrée dans l'admin
- [ ] Statistiques d'utilisation avancées
- [ ] Support multi-modèles par clé
- [ ] Webhooks pour les événements
- [ ] Quotas mensuels
