import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, 'data/users.json');

console.log('=== Diagnostic des utilisateurs ===\n');
console.log('Chemin du fichier:', USERS_FILE);
console.log('Le fichier existe:', fs.existsSync(USERS_FILE));

if (fs.existsSync(USERS_FILE)) {
    const content = fs.readFileSync(USERS_FILE, 'utf8');
    const data = JSON.parse(content);
    
    console.log('\nNombre d\'utilisateurs:', data.users.length);
    console.log('\nListe des utilisateurs:');
    data.users.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.username} (${user.role}) - ID: ${user.id}`);
        console.log(`     Créé le: ${user.createdAt}`);
        console.log(`     Projets: ${user.projects.length > 0 ? user.projects.join(', ') : 'Aucun'}`);
    });
    
    console.log('\n=== Contenu complet (sans mots de passe) ===');
    const usersWithoutPasswords = data.users.map(({ password, ...user }) => user);
    console.log(JSON.stringify({ users: usersWithoutPasswords }, null, 2));
} else {
    console.log('\n❌ Le fichier n\'existe pas encore.');
    console.log('Il sera créé au premier démarrage de l\'application.');
}
