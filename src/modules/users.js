/**
 * Module de gestion des utilisateurs et rôles
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, '../../data/users.json');
const DATA_DIR = path.join(__dirname, '../../data');

/**
 * Initialise le fichier des utilisateurs
 */
function initUsersFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(USERS_FILE)) {
        const defaultAdmin = {
            users: [
                {
                    id: crypto.randomUUID(),
                    username: 'admin',
                    password: hashPassword('admin123'),
                    role: 'admin',
                    createdAt: new Date().toISOString(),
                    projects: []
                }
            ]
        };
        fs.writeFileSync(USERS_FILE, JSON.stringify(defaultAdmin, null, 2));
    }
}

/**
 * Hash un mot de passe
 */
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Lit les utilisateurs
 */
function readUsers() {
    initUsersFile();
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
}

/**
 * Écrit les utilisateurs
 */
function writeUsers(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Authentifie un utilisateur
 */
function authenticate(username, password) {
    const data = readUsers();
    const user = data.users.find(u => u.username === username);
    
    if (!user) {
        return { success: false, error: 'Utilisateur non trouvé' };
    }

    const hashedPassword = hashPassword(password);
    if (user.password !== hashedPassword) {
        return { success: false, error: 'Mot de passe incorrect' };
    }

    const { password: _, ...userWithoutPassword } = user;
    return { success: true, user: userWithoutPassword };
}

/**
 * Liste tous les utilisateurs (sans mots de passe)
 */
function listUsers() {
    const data = readUsers();
    return data.users.map(({ password, ...user }) => user);
}

/**
 * Récupère un utilisateur par ID
 */
function getUserById(userId) {
    const data = readUsers();
    const user = data.users.find(u => u.id === userId);
    if (!user) return null;
    
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
}

/**
 * Crée un nouvel utilisateur
 */
function createUser(username, password, role = 'user', mustChangePassword = false, firstName = '', lastName = '') {
    const data = readUsers();
    
    if (data.users.find(u => u.username === username)) {
        throw new Error('Un utilisateur avec ce nom existe déjà');
    }

    if (!['admin', 'user'].includes(role)) {
        throw new Error('Rôle invalide. Doit être "admin" ou "user"');
    }

    if (password.length < 6) {
        throw new Error('Le mot de passe doit contenir au moins 6 caractères');
    }

    const newUser = {
        id: crypto.randomUUID(),
        username,
        firstName: firstName || '',
        lastName: lastName || '',
        password: hashPassword(password),
        role,
        mustChangePassword: !!mustChangePassword,
        createdAt: new Date().toISOString(),
        projects: []
    };

    data.users.push(newUser);
    writeUsers(data);

    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
}

/**
 * Supprime un utilisateur
 */
function deleteUser(userId) {
    const data = readUsers();
    const index = data.users.findIndex(u => u.id === userId);
    
    if (index === -1) {
        throw new Error('Utilisateur non trouvé');
    }

    const user = data.users[index];
    if (user.username === 'admin' && user.role === 'admin') {
        const adminCount = data.users.filter(u => u.role === 'admin').length;
        if (adminCount === 1) {
            throw new Error('Impossible de supprimer le dernier administrateur');
        }
    }

    data.users.splice(index, 1);
    writeUsers(data);
}

/**
 * Change le mot de passe d'un utilisateur
 */
function changePassword(userId, newPassword) {
    if (newPassword.length < 6) {
        throw new Error('Le mot de passe doit contenir au moins 6 caractères');
    }

    const data = readUsers();
    const user = data.users.find(u => u.id === userId);
    
    if (!user) {
        throw new Error('Utilisateur non trouvé');
    }

    user.password = hashPassword(newPassword);
    user.mustChangePassword = false;
    writeUsers(data);
}

/**
 * Associe un projet à un utilisateur
 */
function assignProjectToUser(userId, projectName) {
    const data = readUsers();
    const user = data.users.find(u => u.id === userId);
    
    if (!user) {
        throw new Error('Utilisateur non trouvé');
    }

    if (!user.projects.includes(projectName)) {
        user.projects.push(projectName);
        writeUsers(data);
    }
}

/**
 * Retire un projet d'un utilisateur
 */
function removeProjectFromUser(userId, projectName) {
    const data = readUsers();
    const user = data.users.find(u => u.id === userId);
    
    if (!user) {
        throw new Error('Utilisateur non trouvé');
    }

    user.projects = user.projects.filter(p => p !== projectName);
    writeUsers(data);
}

/**
 * Récupère les projets d'un utilisateur
 */
function getUserProjects(userId) {
    const data = readUsers();
    const user = data.users.find(u => u.id === userId);
    
    if (!user) {
        throw new Error('Utilisateur non trouvé');
    }

    return user.projects;
}

/**
 * Met à jour les informations d'un utilisateur
 */
function updateUser(userId, updates) {
    const data = readUsers();
    const user = data.users.find(u => u.id === userId);
    
    if (!user) {
        throw new Error('Utilisateur non trouvé');
    }

    // Vérifier si le nouveau username n'est pas déjà pris
    if (updates.username && updates.username !== user.username) {
        if (data.users.find(u => u.username === updates.username)) {
            throw new Error('Ce nom d\'utilisateur est déjà utilisé');
        }
    }

    // Mettre à jour les champs autorisés
    if (updates.firstName !== undefined) user.firstName = updates.firstName;
    if (updates.lastName !== undefined) user.lastName = updates.lastName;
    if (updates.username !== undefined) user.username = updates.username;
    if (updates.mustChangePassword !== undefined) user.mustChangePassword = !!updates.mustChangePassword;

    writeUsers(data);
    
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
}

/**
 * Change le rôle d'un utilisateur
 */
function changeUserRole(userId, newRole) {
    if (!['admin', 'user'].includes(newRole)) {
        throw new Error('Rôle invalide. Doit être "admin" ou "user"');
    }

    const data = readUsers();
    const user = data.users.find(u => u.id === userId);
    
    if (!user) {
        throw new Error('Utilisateur non trouvé');
    }

    if (user.role === 'admin' && newRole === 'user') {
        const adminCount = data.users.filter(u => u.role === 'admin').length;
        if (adminCount === 1) {
            throw new Error('Impossible de rétrograder le dernier administrateur');
        }
    }

    user.role = newRole;
    writeUsers(data);
}

export default {
    authenticate,
    listUsers,
    getUserById,
    createUser,
    deleteUser,
    changePassword,
    assignProjectToUser,
    removeProjectFromUser,
    getUserProjects,
    updateUser,
    changeUserRole
};
