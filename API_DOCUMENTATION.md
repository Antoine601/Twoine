# Documentation API - Twoine AI Integration

## Vue d'ensemble

Twoine intègre Ollama pour fournir des capacités d'IA via une API sécurisée avec authentification par clé API et rate limiting.

## Authentification

Toutes les requêtes vers les endpoints IA nécessitent une clé API valide. Vous pouvez passer la clé de deux façons :

### Header X-API-Key
```bash
curl -X POST https://votre-domaine.com/api/ai/chat \
  -H "X-API-Key: twn_votre_cle_api_ici" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Bonjour!"}]}'
```

### Header Authorization (Bearer)
```bash
curl -X POST https://votre-domaine.com/api/ai/chat \
  -H "Authorization: Bearer twn_votre_cle_api_ici" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Bonjour!"}]}'
```

## Endpoints IA

### POST /api/ai/chat

Endpoint de chat conversationnel utilisant le format de messages OpenAI-compatible.

**Authentification requise** : Oui (clé API)

**Corps de la requête** :
```json
{
  "messages": [
    {
      "role": "system",
      "content": "Tu es un assistant utile."
    },
    {
      "role": "user",
      "content": "Quelle est la capitale de la France?"
    }
  ],
  "stream": false
}
```

**Paramètres** :
- `messages` (array, requis) : Liste des messages de la conversation
  - `role` : "system", "user", ou "assistant"
  - `content` : Contenu du message
- `stream` (boolean, optionnel) : Active le streaming de la réponse (défaut: false)

**Réponse** :
```json
{
  "model": "llama3.2",
  "created_at": "2024-02-27T10:00:00.000Z",
  "message": {
    "role": "assistant",
    "content": "La capitale de la France est Paris."
  },
  "done": true
}
```

**Codes d'erreur** :
- `401` : Clé API manquante ou invalide
- `403` : Clé API désactivée
- `429` : Limite de requêtes atteinte
- `500` : Erreur serveur

---

### POST /api/ai/generate

Endpoint de génération de texte simple (completion).

**Authentification requise** : Oui (clé API)

**Corps de la requête** :
```json
{
  "prompt": "Écris un poème sur les montagnes",
  "stream": false
}
```

**Paramètres** :
- `prompt` (string, requis) : Le prompt pour la génération
- `stream` (boolean, optionnel) : Active le streaming de la réponse (défaut: false)

**Réponse** :
```json
{
  "model": "llama3.2",
  "created_at": "2024-02-27T10:00:00.000Z",
  "response": "Les montagnes majestueuses...",
  "done": true
}
```

---

## Endpoints Admin (Gestion des modèles IA)

Ces endpoints nécessitent des privilèges administrateur.

### GET /api/admin/ai-models

Liste tous les modèles Ollama installés.

**Réponse** :
```json
{
  "success": true,
  "data": [
    {
      "name": "llama3.2:latest",
      "id": "a80c4f17acd5",
      "size": "2.0 GB",
      "modified": "2 hours ago"
    }
  ]
}
```

---

### GET /api/admin/ai-models/available

Liste les modèles disponibles sur ollama.com/library.

**Réponse** :
```json
{
  "success": true,
  "data": [
    {
      "name": "llama3.2",
      "title": "Llama 3.2",
      "description": "Meta's latest Llama model"
    }
  ]
}
```

---

### POST /api/admin/ai-models/install

Installe un nouveau modèle Ollama.

**Corps de la requête** :
```json
{
  "modelName": "llama3.2"
}
```

**Réponse** :
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Modèle llama3.2 installé",
    "output": "pulling manifest..."
  }
}
```

---

### DELETE /api/admin/ai-models/:modelName

Supprime un modèle installé.

**Réponse** :
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Modèle llama3.2 supprimé"
  }
}
```

---

## Endpoints de gestion des clés API

### GET /api/api-keys

Liste toutes les clés API (admin) ou les clés des projets de l'utilisateur.

**Paramètres de requête** :
- `projectName` (optionnel) : Filtrer par projet

**Réponse** :
```json
{
  "success": true,
  "data": [
    {
      "id": "apikey_1234567890",
      "name": "Production API",
      "key": "twn_abcd...xyz12345",
      "modelName": "llama3.2",
      "projects": ["mon-projet"],
      "limits": {
        "requestsPerMinute": 10
      },
      "status": "active",
      "createdBy": "admin",
      "createdAt": "2024-02-27T10:00:00.000Z"
    }
  ]
}
```

---

### POST /api/api-keys

Crée une nouvelle clé API.

**Corps de la requête** :
```json
{
  "name": "Production API",
  "modelName": "llama3.2",
  "projects": ["mon-projet", "autre-projet"],
  "requestsPerMinute": 10,
  "createdBy": "admin"
}
```

**Réponse** :
```json
{
  "success": true,
  "data": {
    "id": "apikey_1234567890",
    "name": "Production API",
    "key": "twn_abcdef1234567890...",
    "modelName": "llama3.2",
    "projects": ["mon-projet"],
    "limits": {
      "requestsPerMinute": 10
    },
    "status": "active",
    "createdAt": "2024-02-27T10:00:00.000Z"
  }
}
```

---

### PUT /api/api-keys/:id

Met à jour une clé API existante.

**Corps de la requête** :
```json
{
  "name": "Production API (Updated)",
  "modelName": "mistral",
  "projects": ["mon-projet"],
  "limits": {
    "requestsPerMinute": 20
  },
  "status": "active"
}
```

---

### DELETE /api/api-keys/:id

Supprime une clé API.

**Réponse** :
```json
{
  "success": true,
  "message": "Clé API supprimée"
}
```

---

### POST /api/api-keys/:id/regenerate

Régénère une clé API (nouvelle valeur, historique d'utilisation réinitialisé).

**Réponse** :
```json
{
  "success": true,
  "data": {
    "id": "apikey_1234567890",
    "key": "twn_nouvelle_cle_generee...",
    "usage": []
  }
}
```

---

### GET /api/api-keys/:id/usage

Récupère l'historique d'utilisation d'une clé API.

**Paramètres de requête** :
- `limit` (optionnel, défaut: 100) : Nombre d'entrées à retourner

**Réponse** :
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2024-02-27T10:00:00.000Z",
      "endpoint": "/api/ai/chat",
      "model": "llama3.2",
      "messagesCount": 2
    }
  ]
}
```

---

## Rate Limiting

Chaque clé API a une limite de requêtes par minute configurable (défaut: 10 req/min).

Lorsque la limite est atteinte, l'API retourne :

```json
{
  "success": false,
  "error": "Limite de 10 requêtes par minute atteinte"
}
```

**Code HTTP** : `429 Too Many Requests`

---

## Exemples d'utilisation

### JavaScript (Node.js)

```javascript
const axios = require('axios');

const API_KEY = 'twn_votre_cle_api';
const BASE_URL = 'https://votre-domaine.com';

async function chat(messages) {
  try {
    const response = await axios.post(
      `${BASE_URL}/api/ai/chat`,
      { messages },
      {
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Erreur:', error.response?.data || error.message);
    throw error;
  }
}

// Utilisation
chat([
  { role: 'user', content: 'Bonjour!' }
]).then(result => {
  console.log(result.message.content);
});
```

### Python

```python
import requests

API_KEY = 'twn_votre_cle_api'
BASE_URL = 'https://votre-domaine.com'

def chat(messages):
    response = requests.post(
        f'{BASE_URL}/api/ai/chat',
        json={'messages': messages},
        headers={
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json'
        }
    )
    response.raise_for_status()
    return response.json()

# Utilisation
result = chat([
    {'role': 'user', 'content': 'Bonjour!'}
])
print(result['message']['content'])
```

### cURL

```bash
# Chat
curl -X POST https://votre-domaine.com/api/ai/chat \
  -H "X-API-Key: twn_votre_cle_api" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Bonjour!"}
    ]
  }'

# Generate
curl -X POST https://votre-domaine.com/api/ai/generate \
  -H "X-API-Key: twn_votre_cle_api" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Écris un poème"
  }'
```

---

## Sécurité

### Bonnes pratiques

1. **Ne jamais exposer vos clés API** dans le code client (frontend)
2. **Utiliser HTTPS** pour toutes les requêtes
3. **Stocker les clés** dans des variables d'environnement
4. **Régénérer les clés** compromises immédiatement
5. **Limiter les projets** associés à chaque clé
6. **Monitorer l'utilisation** via l'endpoint `/api/api-keys/:id/usage`

### Rotation des clés

Il est recommandé de régénérer vos clés API périodiquement :

```bash
curl -X POST https://votre-domaine.com/api/api-keys/{id}/regenerate \
  -H "Authorization: Bearer votre_token_admin"
```

---

## Support

Pour toute question ou problème :
- Documentation Ollama : https://ollama.com/docs
- GitHub Issues : https://github.com/Antoine601/Twoine/issues
