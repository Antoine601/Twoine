import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, 'data/users.json');
const BACKUP_FILE = path.join(__dirname, 'data/users.backup.json');

console.log('=== Utilitaire de sauvegarde des utilisateurs ===\n');

if (fs.existsSync(USERS_FILE)) {
    const content = fs.readFileSync(USERS_FILE, 'utf8');
    fs.writeFileSync(BACKUP_FILE, content);
    
    const data = JSON.parse(content);
    console.log(`✅ Sauvegarde créée avec succès!`);
    console.log(`   Fichier: ${BACKUP_FILE}`);
    console.log(`   Nombre d'utilisateurs sauvegardés: ${data.users.length}`);
    console.log('\nUtilisateurs sauvegardés:');
    data.users.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.username} (${user.role})`);
    });
} else {
    console.log('❌ Le fichier users.json n\'existe pas encore.');
}
