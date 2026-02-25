import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, 'data/users.json');
const BACKUP_FILE = path.join(__dirname, 'data/users.backup.json');

console.log('=== Utilitaire de restauration des utilisateurs ===\n');

if (fs.existsSync(BACKUP_FILE)) {
    const content = fs.readFileSync(BACKUP_FILE, 'utf8');
    const data = JSON.parse(content);
    
    console.log(`Fichier de sauvegarde trouvé avec ${data.users.length} utilisateur(s):`);
    data.users.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.username} (${user.role})`);
    });
    
    fs.writeFileSync(USERS_FILE, content);
    console.log(`\n✅ Utilisateurs restaurés avec succès!`);
    console.log(`   Fichier: ${USERS_FILE}`);
} else {
    console.log('❌ Aucun fichier de sauvegarde trouvé.');
    console.log(`   Recherché: ${BACKUP_FILE}`);
}
