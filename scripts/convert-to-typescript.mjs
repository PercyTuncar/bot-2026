#!/usr/bin/env node

/**
 * Script automatizado para convertir archivos .js a .ts
 * Preserva la estructura del proyecto y mantiene la lógica
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const srcDir = join(__dirname, '..', 'src');

// Archivos ya convertidos
const converted = new Set([
  'config/environment.ts',
  'config/constants.ts',
  'lib/logger.ts',
  'lib/qr-handler.ts',
  'utils/phone.ts',
  'types/index.ts',
  'types/whatsapp.types.ts',
  'types/firestore.types.ts',
  'types/command.types.ts'
]);

function convertJsImports(content) {
  // Convertir imports de .js a .js (mantener .js en TypeScript ESM)
  return content.replace(/from\s+['"](.+?)\.js['"]/g, "from '$1.js'");
}

function addBasicTypes(content, filename) {
  // Agregar tipos básicos comunes
  let result = content;
  
  // Reemplazar parámetros de función sin tipos
  result = result.replace(/function\s+(\w+)\s*\(([^)]*)\)/g, (match, funcName, params) => {
    if (params.trim() === '') return match;
    
    // Si ya tiene tipos TypeScript, no modificar
    if (params.includes(':')) return match;
    
    // Agregar tipos básicos
    const typedParams = params.split(',').map(p => {
      const paramName = p.trim();
      if (!paramName) return p;
      
      // Inferir tipo básico por nombre
      if (paramName.includes('phone') || paramName.includes('id') || paramName.includes('name') || paramName.includes('message')) {
        return `${paramName}: string`;
      }
      if (paramName.includes('count') || paramName.includes('level') || paramName.includes('points')) {
        return `${paramName}: number`;
      }
      if (paramName.includes('enabled') || paramName.includes('is')) {
        return `${paramName}: boolean`;
      }
      return `${paramName}: any`;
    }).join(', ');
    
    return `function ${funcName}(${typedParams})`;
  });
  
  return result;
}

function convertFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  let converted = convertJsImports(content);
  converted = addBasicTypes(converted, filePath);
  
  // Escribir archivo .ts
  const tsPath = filePath.replace(/\.js$/, '.ts');
  writeFileSync(tsPath, converted, 'utf-8');
  
  console.log(`✅ Convertido: ${filePath.replace(srcDir, 'src')} → ${tsPath.replace(srcDir, 'src')}`);
}

function walkDirectory(dir, callback) {
  const files = readdirSync(dir);
  
  files.forEach(file => {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '.git') {
        walkDirectory(fullPath, callback);
      }
    } else if (stat.isFile() && extname(file) === '.js') {
      callback(fullPath);
    }
  });
}

function main() {
  console.log('🚀 Iniciando conversión automática a TypeScript...\n');
  
  let count = 0;
  let skipped = 0;
  
  walkDirectory(srcDir, (filePath) => {
    const relativePath = filePath.replace(srcDir + '/', '').replace(/\\/g, '/');
    const tsRelativePath = relativePath.replace(/\.js$/, '.ts');
    
    // Saltar archivos ya convertidos
    if (converted.has(tsRelativePath)) {
      skipped++;
      console.log(`⏭️  Saltado (ya convertido): ${relativePath}`);
      return;
    }
    
    try {
      convertFile(filePath);
      count++;
    } catch (error) {
      console.error(`❌ Error convirtiendo ${relativePath}:`, error.message);
    }
  });
  
  console.log(`\n✨ Conversión completada:`);
  console.log(`   📄 Archivos convertidos: ${count}`);
  console.log(`   ⏭️  Archivos saltados: ${skipped}`);
  console.log(`   🎯 Total procesado: ${count + skipped}`);
  console.log(`\n⚠️  Nota: Revisa los archivos generados y ajusta tipos manualmente donde sea necesario.`);
}

main();
