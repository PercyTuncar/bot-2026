#!/bin/bash

# ============================================================
# Script de Deploy para AWS EC2 - WhatsApp Bot
# ============================================================

echo "🚀 Iniciando deploy del WhatsApp Bot en AWS EC2..."

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 1. Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    print_error "No se encontró package.json. Asegúrate de estar en el directorio del bot."
    exit 1
fi

print_success "Directorio correcto verificado"

# 2. Instalar dependencias si es necesario
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
    if [ $? -ne 0 ]; then
        print_error "Error al instalar dependencias"
        exit 1
    fi
    print_success "Dependencias instaladas"
else
    print_success "Dependencias ya instaladas"
fi

# 3. Crear directorio de logs si no existe
if [ ! -d "logs" ]; then
    mkdir -p logs
    print_success "Directorio de logs creado"
fi

# 4. Limpiar compilación anterior
if [ -d "dist" ]; then
    echo "🧹 Limpiando compilación anterior..."
    rm -rf dist
    print_success "Compilación anterior eliminada"
fi

# 5. Compilar TypeScript
echo "🔨 Compilando TypeScript a JavaScript..."
npm run build

if [ $? -ne 0 ]; then
    print_error "Error en la compilación de TypeScript"
    exit 1
fi

print_success "Compilación exitosa"

# 6. Verificar que dist/index.js existe
if [ ! -f "dist/index.js" ]; then
    print_error "No se generó dist/index.js después de la compilación"
    exit 1
fi

print_success "Archivo dist/index.js verificado"

# 7. Detener PM2 si está corriendo
echo "🛑 Deteniendo PM2 si está corriendo..."
pm2 stop whatsapp-bot 2>/dev/null || true
pm2 delete whatsapp-bot 2>/dev/null || true
print_success "PM2 detenido"

# 8. Iniciar con PM2
echo "🚀 Iniciando bot con PM2..."
pm2 start ecosystem.config.cjs

if [ $? -ne 0 ]; then
    print_error "Error al iniciar PM2"
    exit 1
fi

print_success "Bot iniciado con PM2"

# 9. Guardar configuración de PM2 para auto-start
echo "💾 Guardando configuración de PM2..."
pm2 save

if [ $? -ne 0 ]; then
    print_warning "No se pudo guardar la configuración de PM2"
else
    print_success "Configuración de PM2 guardada"
fi

# 10. Configurar PM2 para iniciar al arrancar el sistema (solo primera vez)
echo ""
print_warning "Para configurar PM2 para que inicie automáticamente al arrancar el sistema, ejecuta:"
echo "pm2 startup"
echo "# Copia y pega el comando que te muestre"
echo "pm2 save"

# 11. Mostrar estado
echo ""
echo "📊 Estado del bot:"
pm2 status

echo ""
echo "📝 Para ver los logs en tiempo real, ejecuta:"
echo "pm2 logs whatsapp-bot"

echo ""
print_success "🎉 Deploy completado exitosamente!"
