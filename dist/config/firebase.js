import admin from 'firebase-admin';
import { config } from './environment.js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let firebaseApp = null;
export function initializeFirebase() {
    if (firebaseApp) {
        return firebaseApp;
    }
    try {
        const credentialsPath = join(process.cwd(), config.firebase.credentialsPath);
        if (!existsSync(credentialsPath)) {
            throw new Error(`❌ Archivo de credenciales no encontrado: ${credentialsPath}\n` +
                `Por favor, obtén el archivo firebase-credentials.json desde:\n` +
                `Firebase Console > Project Settings > Service Accounts > Generate new private key\n` +
                `Y guárdalo en: ${credentialsPath}`);
        }
        const serviceAccount = JSON.parse(readFileSync(credentialsPath, 'utf8'));
        if (!serviceAccount.project_id && !serviceAccount.private_key) {
            throw new Error('❌ El archivo firebase-credentials.json no tiene la estructura correcta.\n' +
                'Asegúrate de descargar el archivo completo desde Firebase Console.');
        }
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: config.firebase.projectId || serviceAccount.project_id
        });
        console.log('✅ Firebase Admin inicializado correctamente');
        return firebaseApp;
    }
    catch (error) {
        console.error('❌ Error al inicializar Firebase:', error.message);
        throw error;
    }
}
export function getFirestore() {
    if (global.__MOCK_DB__) {
        return global.__MOCK_DB__;
    }
    if (!firebaseApp) {
        initializeFirebase();
    }
    return admin.firestore();
}
export function getAuth() {
    if (!firebaseApp) {
        initializeFirebase();
    }
    return admin.auth();
}
export default { initializeFirebase, getFirestore, getAuth };
