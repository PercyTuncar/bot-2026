# 📸 Sistema de Mensajes de Bienvenida Optimizado

## 🎯 Características

El sistema de bienvenida ha sido **optimizado** para ser más rápido y eficiente:

- ✅ **NO genera imágenes** con Sharp (proceso eliminado)
- ✅ **Solo usa URLs** de imágenes configuradas
- ✅ **Envío de DM** con imagen promocional de forma asíncrona
- ✅ **Indicador "escribiendo"** se mantiene activo
- ✅ **Solo usa Baileys** (no whatsapp-web.js)

## 🚀 Flujo de Bienvenida

Cuando un usuario se une a un grupo:

1. **Indicador de escritura** → Se activa "escribiendo..." en el grupo
2. **DM al usuario** → Envío asíncrono de mensaje privado con imagen promocional
3. **Mensaje al grupo** → Envío de mensaje de bienvenida (texto + imagen opcional)
4. **Detener escritura** → Se desactiva el indicador

### 📨 Mensaje DM (Privado)

Se envía automáticamente a cada nuevo miembro:
- Imagen: `https://res.cloudinary.com/dz1qivt7m/image/upload/v1765843159/anuncio_oficial_ultra_peru_PRECIOS-min_cuycvk.png`
- Contenido: Información sobre RaveHub y Ultra Perú
- **Envío asíncrono**: No bloquea el mensaje de bienvenida al grupo

### 👋 Mensaje al Grupo

Opciones:
1. **Solo texto** (por defecto)
2. **Texto + imagen** (si se configura URL de imagen)

## ⚙️ Configuración

### 1. Habilitar/Deshabilitar Bienvenidas

```bash
.welcome on    # Activar bienvenidas
.welcome off   # Desactivar bienvenidas
```

### 2. Configurar Mensaje de Bienvenida

```bash
.welcome set ¡Bienvenido @usuario al grupo @grupo! 🎉
```

**Placeholders disponibles:**
- `@usuario` o `@user` → Mención del nuevo miembro
- `@nombre` o `@name` → Nombre del nuevo miembro
- `@grupo` o `@group` → Nombre del grupo
- `@count` → Cantidad de miembros

### 3. Configurar Imagen de Bienvenida (OPCIONAL)

Para enviar una **imagen estática** junto con el texto:

```bash
.welcome set ¡Bienvenido @usuario! https://tu-imagen.com/bienvenida.jpg
```

**Importante:**
- La URL debe terminar en `.jpg`, `.jpeg`, `.png`, o `.webp`
- La imagen se descarga y envía (NO se genera con Sharp)
- Si la URL falla, se envía solo texto

### 4. Eliminar Imagen de Bienvenida

```bash
.welcome set ¡Bienvenido @usuario al grupo! 
```
(Sin URL al final = solo texto)

## 🔧 Configuración Técnica

### Variables de Entorno

Ya **NO se necesitan** estas variables (obsoletas):
- ❌ `WELCOME_IMAGES=true` (ya no se usa)
- ❌ `WELCOME_BG_URL` (ya no se usa)
- ❌ `CLOUDINARY_*` (solo para otras funciones, no para bienvenida)

### Estructura en Firestore

```typescript
{
  welcome: {
    enabled: boolean,
    message: string,
    imageUrl?: string  // URL de imagen estática (opcional)
  }
}
```

## 📋 Ejemplos de Uso

### Ejemplo 1: Solo Texto
```bash
.welcome on
.welcome set ¡Hola @usuario! Bienvenido a @grupo 🎉 Somos @count miembros
```

**Resultado:**
```
¡Hola @51987654321! Bienvenido a RaveHub 🎉 Somos 245 miembros
```

### Ejemplo 2: Texto + Imagen
```bash
.welcome on
.welcome set ¡Bienvenido @usuario! 🎊 https://i.imgur.com/example.jpg
```

**Resultado:**
- Envía la imagen de `https://i.imgur.com/example.jpg`
- Caption: `¡Bienvenido @51987654321! 🎊`

### Ejemplo 3: Multi-línea
```bash
.welcome set ¡Hola @usuario! 👋

Bienvenido a *@grupo*
Somos @count miembros

Lee las reglas en la descripción 📜
```

## 🔍 Solución de Problemas

### La imagen no se envía
1. Verifica que la URL sea accesible (abre en navegador)
2. Verifica que termine en `.jpg`, `.jpeg`, `.png`, o `.webp`
3. Si persiste, el bot enviará solo texto (fallback automático)

### El DM no llega al usuario
- **Normal**: Algunos usuarios tienen privacidad configurada
- El bot intenta enviar, pero no falla si el usuario no acepta mensajes
- Esto no afecta el mensaje al grupo

### La mención no funciona
- El bot usa resolución de LID automática
- Si es un LID sin resolver, el nombre se mostrará pero sin @mención
- Esto es una limitación de WhatsApp con números LID

## 📊 Ventajas del Nuevo Sistema

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Generación** | Sharp (CPU intensivo) | Solo descarga URL |
| **Tiempo** | 3-5 segundos | <1 segundo |
| **Memoria** | Alto uso | Bajo uso |
| **Dependencias** | Sharp + fonts | Solo fetch |
| **Flexibilidad** | Plantilla fija | Cualquier imagen |
| **DM** | Bloqueante | Asíncrono |

## 🎨 Personalización Avanzada

### Imagen con Caption Personalizado

Puedes usar servicios como:
- **Canva**: Crea diseños y exporta URL
- **Cloudinary**: Sube imágenes y obtén URL
- **Imgur**: Sube y comparte
- **CDN propio**: Usa tu servidor

### Múltiples Grupos con Diferentes Imágenes

Cada grupo puede tener su propia configuración:

```bash
# Grupo 1 (Ultra Perú)
.welcome set ¡Bienvenido @usuario! 🎊 https://cdn.com/ultra-peru.jpg

# Grupo 2 (Otro evento)
.welcome set ¡Hola @usuario! 🔥 https://cdn.com/otro-evento.jpg
```

## 🚀 Deploy en AWS EC2

Después de actualizar el código:

```bash
cd ~/whatsapp-bot
git pull
npm run build
npm run pm2:restart
```

O usa el script automatizado:
```bash
./deploy-aws.sh
```

## 📝 Notas Importantes

1. ✅ **Sharp eliminado**: Ya no se genera ninguna imagen con Sharp
2. ✅ **Solo Baileys**: El bot usa únicamente `@whiskeysockets/baileys`
3. ✅ **Indicador de escritura**: Se mantiene durante el proceso
4. ✅ **DM asíncrono**: No bloquea el mensaje al grupo
5. ✅ **Fallback automático**: Si la imagen falla, envía solo texto

## 🆘 Soporte

Si tienes problemas:
1. Verifica logs: `pm2 logs whatsapp-bot`
2. Busca errores con: `pm2 logs whatsapp-bot --err`
3. Reinicia el bot: `npm run pm2:restart`

---

**Última actualización:** Diciembre 2025  
**Versión:** 2.0 (Optimizado - Sin Sharp)
