#!/usr/bin/env node
/**
 * TWOINE - Initial Admin Setup Script
 * Crée le premier compte administrateur au démarrage
 * 
 * Usage:
 *   node scripts/setup-initial-admin.js
 *   
 * Avec variables d'environnement:
 *   ADMIN_USERNAME=admin ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=SecurePass123! node scripts/setup-initial-admin.js
 */

const mongoose = require('mongoose');
const readline = require('readline');
const path = require('path');

// Charger les variables d'environnement
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../src/models/User');
const AuthService = require('../src/services/AuthService');

// Configuration MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/twoine';

/**
 * Poser une question en ligne de commande
 */
function question(rl, prompt, hidden = false) {
    return new Promise((resolve) => {
        if (hidden) {
            process.stdout.write(prompt);
            let input = '';
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            
            const onData = (char) => {
                if (char === '\n' || char === '\r' || char === '\u0004') {
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', onData);
                    console.log('');
                    resolve(input);
                } else if (char === '\u0003') {
                    process.exit();
                } else if (char === '\u007F') {
                    input = input.slice(0, -1);
                    process.stdout.clearLine();
                    process.stdout.cursorTo(0);
                    process.stdout.write(prompt + '*'.repeat(input.length));
                } else {
                    input += char;
                    process.stdout.write('*');
                }
            };
            
            process.stdin.on('data', onData);
        } else {
            rl.question(prompt, resolve);
        }
    });
}

/**
 * Script principal
 */
async function main() {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           TWOINE - Initial Admin Setup                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    try {
        // Connexion à MongoDB
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        console.log('');

        // Vérifier si un admin existe déjà
        const adminExists = await User.adminExists();
        
        if (adminExists) {
            console.log('⚠️  An admin user already exists!');
            console.log('');
            
            const admins = await User.find({ role: 'admin' }).select('username email createdAt');
            console.log('Existing admin accounts:');
            admins.forEach(admin => {
                console.log(`  - ${admin.username} (${admin.email}) - Created: ${admin.createdAt.toISOString()}`);
            });
            console.log('');
            console.log('If you need to create another admin, use the web interface or API.');
            console.log('');
            
            await mongoose.disconnect();
            process.exit(0);
        }

        // Récupérer les informations depuis les variables d'environnement ou demander
        let username = process.env.ADMIN_USERNAME;
        let email = process.env.ADMIN_EMAIL;
        let password = process.env.ADMIN_PASSWORD;

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        if (!username || !email || !password) {
            console.log('Please provide the initial admin credentials:');
            console.log('');
        }

        // Username
        if (!username) {
            username = await question(rl, '👤 Username: ');
            if (!username || username.length < 3) {
                console.log('❌ Username must be at least 3 characters');
                rl.close();
                await mongoose.disconnect();
                process.exit(1);
            }
        }

        // Email
        if (!email) {
            email = await question(rl, '📧 Email: ');
            if (!email || !email.includes('@')) {
                console.log('❌ Please provide a valid email');
                rl.close();
                await mongoose.disconnect();
                process.exit(1);
            }
        }

        // Password
        if (!password) {
            password = await question(rl, '🔑 Password: ', false); // Note: En production, utiliser hidden=true
            
            // Valider la force du mot de passe
            const validation = AuthService.validatePassword(password);
            if (!validation.valid) {
                console.log('');
                console.log('❌ Password does not meet requirements:');
                validation.errors.forEach(err => console.log(`   - ${err}`));
                rl.close();
                await mongoose.disconnect();
                process.exit(1);
            }
        }

        rl.close();

        console.log('');
        console.log('📝 Creating admin account...');

        // Créer l'admin
        const admin = await User.createInitialAdmin({
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            password,
            profile: {
                firstName: 'Admin',
                lastName: 'Twoine',
            },
        });

        console.log('');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║              ✅ Admin account created!                     ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log(`   Username:  ${admin.username}`);
        console.log(`   Email:     ${admin.email}`);
        console.log(`   Role:      ${admin.role}`);
        console.log(`   ID:        ${admin._id}`);
        console.log('');
        console.log('⚠️  IMPORTANT: Keep these credentials safe!');
        console.log('   You can now login to Twoine with these credentials.');
        console.log('');

    } catch (error) {
        console.error('');
        console.error('❌ Error:', error.message);
        
        if (error.code === 11000) {
            console.error('   Username or email already exists.');
        }
        
        console.error('');
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

// Exécuter le script
main().catch(console.error);
