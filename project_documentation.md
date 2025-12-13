# ESPECIFICACIONES TÉCNICAS - BOT DE WHATSAPP CON WHATSAPP-WEB.JS 1.34.2

## 1. DESCRIPCIÓN GENERAL DEL SISTEMA

Bot de WhatsApp para gestión de grupos con sistema de puntos, niveles, comandos personalizados, moderación automática y sistema de recompensas. El bot debe ser escalable, modular y fácil de mantener.

---

## 2. ARQUITECTURA DEL SISTEMA

### 2.1 Componentes Principales

**2.1.1 Sistema de Autenticación**
- Inicialización con QR Code en terminal
- Estrategia de autenticación: LocalAuth de whatsapp-web.js
- Persistencia de sesión para evitar escanear QR en cada reinicio
- Mensaje de bienvenida automático al DM del propietario al conectarse

**2.1.2 Sistema de Comandos (Command Handler)**
- Carpeta `/comandos` en la raíz del proyecto
- Cada comando es un archivo independiente exportando un objeto con propiedades estándar
- Carga dinámica de comandos al iniciar el bot
- Sistema de prefijos personalizables por grupo (default: ".")
- Sistema de aliases para comandos
- Sistema de permisos (users, admins, superadmin)

**2.1.3 Gestión de Grupos**
- Activación/desactivación por grupo
- Comando `.listgroups` muestra todos los grupos donde está el bot
- Formato de lista: ID | Nombre | Estado (Activo/Inactivo) | Miembros
- Activación mediante `.bot on {groupId}` desde DM del propietario

**2.1.4 Sistema de Base de Datos**
- Firebase Firestore (recomendado por escalabilidad y queries en tiempo real)
- Estructura jerárquica: Groups → Members, Messages, Rewards
- Configuración dentro del documento principal del grupo (no subcolección)

---

## 3. MODELO DE BASE DE DATOS (FIRESTORE)

### 3.1 Colección Principal: `groups`

Cada documento representa un grupo de WhatsApp:

```javascript
// Documento: groups/{groupId}
{
  // ============ IDENTIFICACIÓN ============
  id: "120363276446666223@g.us", // (string) ID único del grupo en WhatsApp
  name: "Ravehub developers", // (string) Nombre del grupo
  description: "🔥 Grupo oficial", // (string) Descripción del grupo
  
  // ============ METADATOS TEMPORALES ============
  createdAt: timestamp, // (timestamp) Cuando se creó el documento en BD
  activatedAt: timestamp, // (timestamp) Primera activación del bot en el grupo
  lastActivityAt: timestamp, // (timestamp) Último mensaje procesado
  
  // ============ ESTADO ============
  isActive: true, // (boolean) Si el bot está activo en este grupo
  memberCount: 4, // (number) Cantidad actual de miembros
  totalMessages: 15847, // (number) Total de mensajes procesados en el grupo
  
  // ============ CONFIGURACIÓN (INLINE) ============
  config: {
    // Comandos
    prefix: ".", // (string) Prefijo para ejecutar comandos
    commandsEnabled: true, // (boolean) Si los comandos están habilitados
    
    // Sistema de puntos
    pointsName: "puntos", // (string) Nombre personalizado de los puntos (coins, stars, etc)
    messagesPerPoint: 10, // (number) Cantidad de mensajes para sumar 1 punto
    pointsEnabled: true, // (boolean) Si el sistema de puntos está activo
    
    // Sistema de niveles (array ordenado de menor a mayor)
    levels: [
      { level: 1, name: "Newbie", minPoints: 0, maxPoints: 1999, color: "#gray" },
      { level: 2, name: "Regular", minPoints: 2000, maxPoints: 4999, color: "#blue" },
      { level: 3, name: "Veteran", minPoints: 5000, maxPoints: 9999, color: "#purple" },
      { level: 4, name: "Elite", minPoints: 10000, maxPoints: 19999, color: "#gold" },
      { level: 5, name: "Legend", minPoints: 20000, maxPoints: 999999999, color: "#red" }
    ],
    
    // Sistema de moderación
    maxWarnings: 3, // (number) Warnings antes de expulsar
    autoKickOnMaxWarns: true, // (boolean) Si expulsa automáticamente
    
    // Anti-spam
    antiSpam: {
      enabled: false, // (boolean) Si el anti-spam está activo
      maxMessages: 5, // (number) Máximo de mensajes en el intervalo
      interval: 10 // (number) Intervalo en segundos
    },
    
    // Palabras prohibidas
    bannedWords: {
      enabled: true, // (boolean) Si el filtro está activo
      words: ["palabra1", "palabra2"], // (array) Lista de palabras prohibidas
      action: "warn" // (string) Acción: "warn", "delete", "kick"
    },
    
    // Anti-link
    antiLink: {
      enabled: true, // (boolean) Si el anti-link está activo
      allowedDomains: ["youtube.com", "spotify.com"], // (array) Dominios permitidos
      action: "delete" // (string) Acción: "warn", "delete", "kick"
    },
    
    // Bienvenidas y despedidas
    welcome: {
      enabled: false,
      message: "¡Bienvenido {user} al grupo!" // {user} se reemplaza por @mention
    },
    
    goodbye: {
      enabled: false,
      message: "Adiós {user}, esperamos verte pronto"
    }
  }
}
```

### 3.2 Subcolección: `groups/{groupId}/members`

Cada documento representa un miembro del grupo:

```javascript
// Documento: groups/{groupId}/members/{phone}
{
  // ============ IDENTIFICACIÓN ============
  phone: "51954944278", // (string) Número con código de país (ID único)
  displayName: "JULIO CESAR", // (string) Nombre actual del usuario
  
  // ============ ESTADO DE MEMBRESÍA ============
  isMember: true, // (boolean) Si actualmente está en el grupo
  role: "member", // (string) Rol: "member" | "admin" | "superadmin"
  
  // ============ HISTORIAL TEMPORAL ============
  createdAt: timestamp, // (timestamp) Primera vez registrado en la BD
  joinedAt: timestamp, // (timestamp) Última vez que se unió al grupo
  leftAt: null, // (timestamp|null) Última vez que salió del grupo
  lastMessageAt: timestamp, // (timestamp) Último mensaje enviado
  
  // ============ SISTEMA DE PUNTOS ============
  points: 2500, // (number) Puntos acumulados totales
  messageCount: 25003, // (number) Mensajes enviados desde última suma de punto
  totalMessagesCount: 25003, // (number) Total histórico de mensajes
  currentLevel: 2, // (number) Nivel actual calculado según puntos
  
  // ============ SISTEMA DE MODERACIÓN ============
  warnings: 1, // (number) Warnings actuales
  warnHistory: [ // (array) Historial de warnings
    {
      warnId: "warn_123456", // (string) ID único del warn
      reason: "Spam de enlaces", // (string) Razón del warn
      warnedBy: "51999888777", // (string) Teléfono del admin que advirtió
      warnedByName: "Admin Juan", // (string) Nombre del admin
      timestamp: timestamp, // (timestamp) Cuándo se dio el warn
      removed: false, // (boolean) Si fue removido/perdonado
      removedBy: null, // (string|null) Quién lo removió
      removedAt: null // (timestamp|null) Cuándo se removió
    }
  ],
  
  // ============ ESTADÍSTICAS ============
  stats: {
    totalPointsEarned: 2500, // (number) Total de puntos ganados (sin descontar canjes)
    totalPointsSpent: 0, // (number) Total de puntos gastados en recompensas
    totalRewardsRedeemed: 0, // (number) Total de recompensas canjeadas
    firstMessageDate: timestamp, // (timestamp) Fecha del primer mensaje
    averageMessagesPerDay: 45.5 // (number) Promedio calculado
  }
}
```

### 3.3 Subcolección: `groups/{groupId}/messages`

Registro de todos los mensajes para análisis y auditoría:

```javascript
// Documento: groups/{groupId}/messages/{messageId}
{
  // ============ IDENTIFICACIÓN ============
  messageId: "true_51954944278@c.us_3EB0D...", // (string) ID único del mensaje
  
  // ============ AUTOR ============
  authorPhone: "51954944278", // (string) Teléfono del autor
  authorName: "JULIO CESAR", // (string) Nombre del autor en ese momento
  authorRole: "member", // (string) Rol del autor cuando envió el mensaje
  
  // ============ CONTENIDO ============
  body: "Hola, ¿cómo están?", // (string) Contenido del mensaje
  type: "chat", // (string) Tipo: "chat", "image", "video", "audio", "document", "sticker"
  hasMedia: false, // (boolean) Si tiene archivos adjuntos
  isForwarded: false, // (boolean) Si es mensaje reenviado
  mentionedNumbers: [], // (array) Números mencionados con @
  
  // ============ TIMESTAMP ============
  timestamp: timestamp, // (timestamp) Cuándo se envió el mensaje
  
  // ============ MODERACIÓN ============
  wasDeleted: false, // (boolean) Si el bot lo eliminó
  deletionReason: null, // (string|null) "banned_word" | "link" | "spam"
  triggeredWarn: false, // (boolean) Si generó un warn
  
  // ============ PUNTOS ============
  contributedToPoints: true // (boolean) Si este mensaje contó para puntos
}
```

**NOTA IMPORTANTE SOBRE MENSAJES:**
- Esta colección puede crecer exponencialmente y todo los mensjes siemore deben estar gaurdados 
- Para estadísticas, usar agregaciones periódicas en lugar de queries costosas
- Considerar particionar por fecha: `messages_2025_12`, `messages_2025_11`

### 3.4 Subcolección: `groups/{groupId}/rewards`

Recompensas canjeables con puntos:

```javascript
// Documento: groups/{groupId}/rewards/{rewardId}
{
  // ============ IDENTIFICACIÓN ============
  rewardId: "reward_001", // (string) ID único generado automáticamente
  
  // ============ INFORMACIÓN ============
  name: "Entrada Martin Garrix", // (string) Nombre del premio
  description: "Entrada VIP para el concierto", // (string) Descripción detallada
  imageUrl: "https://...", // (string|null) URL de imagen del premio
  
  // ============ COSTO Y DISPONIBILIDAD ============
  cost: 50000, // (number) Puntos necesarios para canjear
  stock: 10, // (number) Cantidad disponible (-1 = ilimitado)
  isActive: true, // (boolean) Si está disponible para canje
  
  // ============ ESTADÍSTICAS ============
  totalRedeemed: 3, // (number) Veces que ha sido canjeado
  
  // ============ METADATOS ============
  createdAt: timestamp, // (timestamp) Cuándo se creó la recompensa
  createdBy: "51999888777", // (string) Quién creó la recompensa
  updatedAt: timestamp // (timestamp) Última actualización
}
```

### 3.5 Subcolección: `groups/{groupId}/redemptions`

Solicitudes de canje de recompensas:

```javascript
// Documento: groups/{groupId}/redemptions/{redemptionId}
{
  // ============ IDENTIFICACIÓN ============
  redemptionId: "redemption_123456", // (string) ID único autogenerado
  
  // ============ USUARIO ============
  userPhone: "51954944278", // (string) Teléfono del usuario
  userName: "JULIO CESAR", // (string) Nombre al momento del canje
  
  // ============ RECOMPENSA ============
  rewardId: "reward_001", // (string) ID de la recompensa
  rewardName: "Entrada Martin Garrix", // (string) Nombre de la recompensa (denormalizado)
  pointsCost: 50000, // (number) Puntos que costó (denormalizado)
  
  // ============ ESTADO ============
  status: "pending", // (string) "pending" | "approved" | "rejected" | "delivered"
  
  // ============ TIMESTAMPS ============
  requestedAt: timestamp, // (timestamp) Cuándo se solicitó
  processedAt: null, // (timestamp|null) Cuándo se procesó (aprobó/rechazó)
  deliveredAt: null, // (timestamp|null) Cuándo se marcó como entregado
  
  // ============ PROCESAMIENTO ============
  processedBy: null, // (string|null) Teléfono del admin que procesó
  processedByName: null, // (string|null) Nombre del admin
  rejectionReason: null, // (string|null) Razón del rechazo si aplica
  
  // ============ NOTAS ============
  notes: "" // (string) Notas adicionales del admin
}
```

**FLUJO DE CANJE:**
1. Usuario solicita canje → `status: "pending"`, puntos NO se descuentan aún
2. Admin revisa → Puede aprobar o rechazar
3. Si RECHAZA → `status: "rejected"`, puntos permanecen intactos
4. Si APRUEBA → `status: "approved"`, SE DESCUENTAN los puntos del usuario
5. Admin entrega físicamente → `status: "delivered"`

### 3.6 Colección Global: `bot_config`

Configuración global del bot (un solo documento):

```javascript
// Documento: bot_config/settings
{
  // ============ PROPIETARIO ============
  ownerPhone: "51999888777", // (string) Número del super admin
  ownerName: "Bot Master", // (string) Nombre del propietario
  
  // ============ ESTADO ============
  isActive: true, // (boolean) Si el bot está globalmente activo
  lastConnection: timestamp, // (timestamp) Última vez que se conectó
  version: "1.0.0", // (string) Versión del bot
  
  // ============ ESTADÍSTICAS GLOBALES ============
  totalGroups: 15, // (number) Total de grupos registrados
  activeGroups: 8, // (number) Grupos con isActive: true
  totalUsers: 450, // (number) Total de usuarios únicos registrados
  totalMessages: 125000, // (number) Total de mensajes procesados
  
  // ============ CONFIGURACIÓN DE COMANDOS ============
  commandsEnabled: true, // (boolean) Si los comandos están globalmente habilitados
  defaultPrefix: ".", // (string) Prefijo por defecto para nuevos grupos
  
  // ============ LÍMITES ============
  maxGroupsPerOwner: 50, // (number) Máximo de grupos que puede gestionar
  
  // ============ TIMESTAMPS ============
  createdAt: timestamp, // (timestamp) Primera inicialización del bot
  updatedAt: timestamp // (timestamp) Última actualización
}
```

---

## 4. COMANDOS DEL SISTEMA

### 4.1 Estructura de un Comando

Cada archivo en `/comandos` debe exportar:

```javascript
module.exports = {
  name: 'ping', // (string) Nombre del comando (único)
  description: 'Mide la latencia del bot', // (string) Descripción
  alias: ['latencia', 'lag'], // (array) Aliases del comando
  permissions: 'users', // (string) 'users' | 'admins' | 'superadmin'
  category: 'utility', // (string) Categoría para organización
  usage: '.ping', // (string) Ejemplo de uso
  cooldown: 3, // (number) Segundos de espera entre usos (por usuario)
  
  // Función principal del comando
  execute: async (client, message, args, db, groupData, memberData) => {
    // Lógica del comando
  }
};
```

### 4.2 Comandos de Usuarios (permissions: 'users')

**4.2.1 Utilidad**
- `.ping` - Muestra latencia del bot
- `.info [@usuario]` - Información de un usuario (nivel, puntos, mensajes, warns)
- `.rank` - Top 10 usuarios con más puntos del grupo
- `.level` - Muestra tu nivel y progreso actual
- `.rules` - Muestra las reglas del grupo
- `.help [comando]` - Lista de comandos o ayuda específica

**4.2.2 Puntos y Recompensas**
- `.points [@usuario]` - Ver puntos propios o de otro usuario
- `.rewards` - Lista de recompensas disponibles
- `.redeem {rewardId}` - Canjear una recompensa
- `.myredemptions` - Ver mis canjes (pendientes, aprobados, entregados)
- `.leaderboard` - Top usuarios por puntos con niveles

**4.2.3 Información**
- `.profile [@usuario]` - Perfil completo (stats, nivel, puntos, ranking)
- `.groupinfo` - Información del grupo (miembros, mensajes, config)
- `.commands` - Lista de comandos disponibles según permisos

### 4.3 Comandos de Admins (permissions: 'admins')

**4.3.1 Moderación**
- `.warn @usuario {razón}` - Advertir a un usuario
- `.unwarn @usuario` - Remover un warn
- `.warns @usuario` - Ver warns de un usuario
- `.kick @usuario {razón}` - Expulsar a un usuario
- `.ban @usuario {razón}` - Banear (expulsar y guardar en lista negra)
- `.unban {phone}` - Desbanear un número

**4.3.2 Menciones**
- `.tagall {mensaje}` - Mencionar a todos los miembros
- `.tagnoadmins {mensaje}` - Mencionar solo a no-admins
- `.tagadmins {mensaje}` - Mencionar solo a admins
- `.taginactive {días}` - Mencionar usuarios inactivos X días

**4.3.3 Gestión de Puntos**
- `.addpoints @usuario {cantidad}` - Agregar puntos
- `.removepoints @usuario {cantidad}` - Quitar puntos
- `.resetpoints @usuario` - Resetear puntos de un usuario
- `.setlevel @usuario {nivel}` - Cambiar nivel manualmente

**4.3.4 Recompensas**
- `.addreward {nombre} {costo} {stock} {descripción}` - Crear recompensa
- `.editreward {rewardId} {campo} {valor}` - Editar recompensa
- `.deletereward {rewardId}` - Eliminar recompensa
- `.pendingredeem` - Ver canjes pendientes
- `.approveredeem {redemptionId}` - Aprobar canje (descuenta puntos)
- `.rejectredeem {redemptionId} {razón}` - Rechazar canje
- `.deliverredeem {redemptionId}` - Marcar como entregado

**4.3.5 Configuración**
- `.setprefix {prefijo}` - Cambiar prefijo de comandos
- `.setpointsname {nombre}` - Cambiar nombre de puntos
- `.setmessagesperpoint {cantidad}` - Config mensajes por punto
- `.setmaxwarns {cantidad}` - Config warnings máximos
- `.togglecommand {comando}` - Activar/desactivar comando específico
- `.antilink {on|off}` - Activar/desactivar anti-link
- `.allowdomain {dominio}` - Permitir dominio en anti-link
- `.addword {palabra}` - Agregar palabra prohibida
- `.removeword {palabra}` - Quitar palabra prohibida
- `.setwelcome {mensaje}` - Configurar mensaje de bienvenida
- `.setgoodbye {mensaje}` - Configurar mensaje de despedida

**4.3.6 Estadísticas**
- `.stats` - Estadísticas completas del grupo
- `.topactive` - Usuarios más activos del mes
- `.inactive {días}` - Lista de usuarios inactivos
- `.activity` - Gráfico de actividad del grupo

### 4.4 Comandos de SuperAdmin (permissions: 'superadmin')

**Solo ejecutables por el propietario del bot:**

- `.listgroups` - Lista todos los grupos con estado y miembros
- `.bot on {groupId}` - Activar bot en un grupo (DM only)
- `.bot off {groupId}` - Desactivar bot en un grupo (DM only)
- `.broadcast {mensaje}` - Enviar mensaje a todos los grupos activos
- `.globalstats` - Estadísticas globales del bot
- `.restart` - Reiniciar el bot
- `.update` - Actualizar configuración global
- `.backup` - Generar backup de la base de datos
- `.leave {groupId}` - Salir de un grupo

---

## 5. LÓGICA DE FUNCIONAMIENTO

### 5.1 Inicialización del Bot

1. Escanear QR Code en terminal
2. Autenticación exitosa con LocalAuth
3. Enviar mensaje de bienvenida al DM del propietario:
   ```
   ✅ *Bot Activado Exitosamente*
   
   El bot está listo para funcionar.
   
   📋 *Comandos disponibles:*
   • .listgroups - Ver grupos disponibles
   • .bot on {id} - Activar bot en un grupo
   • .help - Ver todos los comandos
   ```
4. Cargar todos los comandos desde `/comandos`
5. Inicializar listeners de eventos

### 5.2 Sistema de Activación de Grupos

**Flujo:**
1. Usuario propietario envía `.listgroups` en su DM
2. Bot responde con lista:
   ```
   📋 *GRUPOS DISPONIBLES*
   
   1️⃣ Ravehub developers
   ID: 120363276446666223
   Estado: ❌ Inactivo
   Miembros: 4
   
   2️⃣ Familia López
   ID: 120363555888999111
   Estado: ✅ Activo
   Miembros: 8
   
   Para activar: .bot on {ID}
   ```
3. Usuario envía `.bot on 120363276446666223`
4. Bot ejecuta:
   - Crear/actualizar documento en `groups/{groupId}`
   - Obtener lista de miembros actuales del grupo
   - Crear documentos en `groups/{groupId}/members` para cada miembro
   - Configuración inicial con valores por defecto
   - Marcar `isActive: true` y `activatedAt: now()`
   - Enviar confirmación al DM
5. Enviar mensaje al grupo activado:
   ```
   🤖 *Bot Activado*
   
   ¡Hola! Ahora estoy activo en este grupo.
   
   📝 Usa {prefix}help para ver comandos.
   ```

### 5.3 Procesamiento de Mensajes

**Flujo por cada mensaje recibido:**

1. **Verificar si es grupo:**
   - Si es DM y es del propietario → Procesar comandos superadmin
   - Si es DM y NO es propietario → Ignorar
   - Si es grupo → Continuar

2. **Verificar si grupo está activo:**
   - Consultar `groups/{groupId}` → `isActive`
   - Si `false` → Ignorar mensaje
   - Si `true` → Continuar

3. **Verificar/Actualizar miembro:**
   - Buscar en `groups/{groupId}/members/{phone}`
   - Si NO existe → Crear con valores iniciales
   - Si existe y `isMember: false` → Actualizar `isMember: true`, `joinedAt: now()`
   - Actualizar `lastMessageAt: now()`
   - Actualizar `displayName` si cambió

4. **Guardar mensaje:**
   - Crear documento en `groups/{groupId}/messages/{messageId}`
   - Incrementar `groups/{groupId}/totalMessages`

5. **Verificar si es comando:**
   - Si empieza con prefijo del grupo → Procesar comando
   - Si NO → Continuar con procesamiento normal

6. **Sistema de puntos:**
   - Incrementar `messageCount` del miembro
   - Si `messageCount >= messagesPerPoint`:
     - Sumar 1 a `points`
     - Resetear `messageCount` a 0
     - Incrementar `totalMessagesCount`
     - Verificar si subió de nivel
     - Si subió de nivel → Enviar mensaje de felicitación

7. **Moderación automática:**
   - **Palabras prohibidas:** Si `bannedWords.enabled` y detecta palabra → Ejecutar acción
   - **Anti-link:** Si `antiLink.enabled` y detecta link no permitido → Ejecutar acción
   - **Anti-spam:** Si envía muchos mensajes rápido → Advertir o eliminar

### 5.4 Sistema de Permisos

**Jerarquía:**
- **SuperAdmin:** Propietario del bot (número configurado en `bot_config`)
- **Admin:** Administradores del grupo de WhatsApp
- **User:** Cualquier miembro del grupo

**Verificación:**
```
SI comando.permissions === 'superadmin':
  - Solo ejecutable si authorPhone === bot_config.ownerPhone
  
SI comando.permissions === 'admins':
  - Ejecutable si authorRole === 'admin' O authorPhone === ownerPhone
  
SI comando.permissions === 'users':
  - Ejecutable por cualquier miembro
```

### 5.5 Sistema de Niveles

**Cálculo de nivel actual:**
```
PARA cada nivel EN config.levels ORDENADO por minPoints:
  SI points >= minPoints Y points <= maxPoints:
    RETORNAR nivel
```

**Detección de subida de nivel:**
- Después de sumar puntos, calcular nivel nuevo
- Si `nivelNuevo > nivelAnterior`:
  - Actualizar `currentLevel` en BD
  - Enviar mensaje:
    ```
    🎉 *¡NIVEL ALCANZADO!*
    
    @usuario has subido a *{levelName}*
    Nivel {level} • {points} puntos
    ```

### 5.6 Sistema de Canjes (Redemptions)

**Flujo completo:**

**SOLICITUD (.redeem {rewardId}):**
1. Verificar que la recompensa existe y está activa
2. Verificar que hay stock disponible (si no es ilimitado)
3. Verificar que el usuario tiene suficientes puntos
4. Crear documento en `redemptions` con `status: "pending"`
5. NO descontar puntos todavía
6. Notificar al usuario: "Solicitud enviada, espera aprobación de un admin"
7. Notificar a admins del grupo: "Nueva solicitud de canje pendiente"

**REVISIÓN ADMIN:**

**APROBAR (.approveredeem {redemptionId}):**
1. Verificar que el admin tiene permisos
2. Verificar que el estado es "pending"
3. Verificar NUEVAMENTE que el usuario tiene los puntos (por si los gastó)
4. **DESCONTAR puntos del usuario** (`points -= pointsCost`)
5. Actualizar `stats.totalPointsSpent` del usuario
6. Decrementar stock de la recompensa (si no es ilimitado)
7. Actualizar redemption: `status: "approved"`, `processedAt: now()`
8. Notificar al usuario: "Tu canje ha sido aprobado"

**RECHAZAR (.rejectredeem {redemptionId} {razón}):**
1. Verificar permisos
2. Verificar que el estado es "pending"
3. Actualizar redemption: `status: "rejected"`, `processedAt: now()`, `rejectionReason`
4. NO tocar los puntos del usuario (siguen intactos)
5. Notificar al usuario: "Tu canje fue rechazado. Razón: {razón}"

**ENTREGAR (.deliverredeem {redemptionId}):**
1. Verificar permisos
2. Verificar que el estado es "approved"
3. Actualizar redemption: `status: "delivered"`, `deliveredAt: now()`
4. Incrementar `stats.totalRewardsRedeemed` del usuario
5. Incrementar `totalRedeemed` de la recompensa
6. Notificar al usuario: "Tu premio ha sido entregado"

**CONSISTENCIA DE DATOS:**
- Los puntos SOLO se descuentan en APROBAR
- Si se rechaza, los puntos permanecen
- Si el usuario ya no tiene puntos al momento de aprobar → Mostrar error al admin
- Todas las operaciones deben ser transaccionales (usar Firestore Transactions)

### 5.7 Sistema de Warns

**Flujo al dar warn (.warn @usuario {razón}):**
1. Verificar permisos del autor (debe ser admin)
2. Obtener documento del miembro
3. Incrementar `warnings`
4. Agregar objeto al array `warnHistory`
5. Verificar si `warnings >= maxWarnings`:
   - Si `autoKickOnMaxWarns === true`:
     - Expulsar al usuario del grupo
     - Actualizar `isMember: false`, `leftAt: now()`
     - Enviar mensaje: "@usuario ha sido expulsado por acumular {maxWarnings} advertencias"
   - Si `false`:
     - Solo notificar: "@usuario tiene {warnings} warnings, uno más y será expulsado"
6. Si no alcanzó el máximo:
   - Notificar: "@usuario ha recibido una advertencia ({warnings}/{maxWarnings}). Razón: {razón}"

**Remover warn (.unwarn @usuario):**
1. Verificar permisos
2. Si `warnings > 0`:
   - Decrementar `warnings`
   - Marcar el warn más reciente como removido en `warnHistory`
   - Notificar: "Se ha removido una advertencia a @usuario"

---

## 6. EVENTOS A ESCUCHAR (whatsapp-web.js)

### 6.1 Eventos Principales

**`qr`** - Mostrar QR en terminal para escanear

**`ready`** - Bot conectado exitosamente
- Enviar mensaje de bienvenida al propietario
- Cargar configuración global
- Sincronizar grupos

**`message`** - Nuevo mensaje recibido
- Procesar según flujo de la sección 5.3

**`message_create`** - Mensaje creado (enviado por el bot)
- Registrar en logs si es necesario

**`group_join`** - Bot fue agregado a un grupo
- Crear documento en `groups` con `isActive: false`
- Enviar al propietario: "Fui agregado a {groupName}. Usa .bot on {id} para activarme"

**`group_leave`** - Bot fue removido de un grupo
- Actualizar `isActive: false` (NO eliminar datos históricos)

**`group_update`** - Información del grupo cambió
- Actualizar `name`, `description`, `memberCount` en BD

**`group_member_join`** - Nuevo miembro se unió
- Crear/actualizar documento en `members` con `isMember: true`, `joinedAt: now()`
- Si `welcome.enabled` → Enviar mensaje de bienvenida

**`group_member_leave`** - Miembro salió del grupo
- Actualizar `isMember: false`, `leftAt: now()`
- Si `goodbye.enabled` → Enviar mensaje de despedida

**`auth_failure`** - Error de autenticación
- Log error y detener bot

---

## 7. CONSIDERACIONES TÉCNICAS

### 7.1 Escalabilidad

**Manejo de mensajes:**
- No cargar todos los mensajes en memoria
- Usar queries paginadas con `limit()`
- Implementar TTL para mensajes antiguos
- Considerar particionamiento temporal

**Caché:**
- Mantener configuración de grupos activos en memoria
- Refrescar cada 5 minutos o al detectar cambio
- Caché de niveles calculados para evitar recálculos

**Rate Limiting:**
- Limitar comandos por usuario (cooldown)
- Limitar operaciones de BD por segundo
- Queue de mensajes si hay mucha carga

### 7.2 Consistencia de Datos

**Transacciones obligatorias para:**
- Canje de recompensas (verificar puntos, descontar, actualizar estado)
- Suma de puntos y cambio de nivel
- Expulsión por warns
- Cualquier operación que modifique múltiples documentos

**Denormalización estratégica:**
- Guardar `rewardName` y `pointsCost` en redemptions (aunque estén en rewards)
- Guardar `userName` en mensajes y redemptions
- Guardar `totalMessages` en grupo (aunque se pueda contar)
- Esto evita queries costosas y mantiene histórico

### 7.3 Seguridad

- Validar SIEMPRE permisos antes de ejecutar comandos
- Sanitizar inputs de usuarios (evitar inyecciones)
- No confiar en role del cliente, siempre verificar en servidor
- Logs de todas las acciones de moderación
- Backup automático diario de Firestore

### 7.4 Rendimiento

**Índices requeridos en Firestore:**
- `groups/{groupId}/members` → Index en `points` (DESC) para leaderboards
- `groups/{groupId}/members` → Index en `lastMessageAt` (DESC) para inactivos
- `groups/{groupId}/messages` → Index compuesto en `timestamp` y `authorPhone`
- `groups/{groupId}/redemptions` → Index en `status` y `requestedAt`

**Límites:**
- Máximo 500 comandos por minuto por grupo
- Máximo 100 menciones en `.tagall`
- Máximo 50 recompensas por grupo
- Máximo 10 canjes pendientes por usuario

### 7.5 Manejo de Errores

**Todos los comandos deben:**
- Envolver en try-catch
- Loggear errores con contexto (groupId, userId, command)
- Responder al usuario con mensaje amigable
- No revelar información sensible en mensajes de error
- Reintentar operaciones críticas (máximo 3 intentos)

---

## 8. FORMATO DE RESPUESTAS DEL BOT

### 8.1 Mensajes de Éxito
```
✅ *TÍTULO*

Descripción del éxito

📝 Detalles adicionales
```

### 8.2 Mensajes de Error
```
❌ *ERROR*

Descripción del error

💡 Sugerencia de solución
```

### 8.3 Información
```
📊 *INFORMACIÓN*

Contenido principal

🔹 Dato 1: Valor
🔹 Dato 2: Valor
```

### 8.4 Warnings/Moderación
```
⚠️ *ADVERTENCIA*

@usuario

Razón: {razón}
Warns: {current}/{max}
```

---

## 9. PRIORIDADES DE IMPLEMENTACIÓN

### FASE 1 - Core (Crítico)
1. Sistema de autenticación y conexión
2. Command handler básico
3. Modelo de BD: groups y members
4. Activación/desactivación de grupos
5. Comandos básicos: .ping, .help, .info

### FASE 2 - Puntos y Niveles
1. Sistema de conteo de mensajes
2. Suma automática de puntos
3. Sistema de niveles
4. Comandos: .points, .level, .rank, .leaderboard

### FASE 3 - Moderación
1. Sistema de warns
2. Comandos de moderación: .warn, .unwarn, .kick
3. Anti-spam, anti-link, palabras prohibidas
4. Comandos de menciones: .tagall, .tagnoadmins

### FASE 4 - Recompensas
1. Modelo de rewards y redemptions
2. Comandos de gestión de recompensas
3. Sistema de canjes completo
4. Comandos de revisión para admins

### FASE 5 - Estadísticas y Extras
1. Comandos de estadísticas avanzadas
2. Sistema de bienvenida/despedida
3. Comandos de configuración avanzada
4. Backup automático

---

## 10. TESTING REQUERIDO

### 10.1 Casos de Prueba Críticos

**Puntos y Niveles:**
- [ ] Usuario envía exactamente `messagesPerPoint` mensajes → suma 1 punto
- [ ] Usuario sube de nivel → se notifica correctamente
- [ ] Múltiples usuarios enviando mensajes simultáneamente → no se pierden puntos

**Canjes:**
- [ ] Usuario canjea sin puntos suficientes → error
- [ ] Admin aprueba canje → puntos se descuentan correctamente
- [ ] Admin rechaza canje → puntos NO se descuentan
- [ ] Usuario intenta canjear cuando no hay stock → error
- [ ] Usuario gasta puntos en otro lado antes de que aprueben canje → error al aprobar

**Warns:**
- [ ] Usuario alcanza `maxWarnings` → se expulsa automáticamente
- [ ] Admin remueve warn → contador disminuye
- [ ] Usuario sale y vuelve → warns persisten

**Permisos:**
- [ ] Usuario normal intenta comando de admin → denegado
- [ ] Admin intenta comando de superadmin → denegado
- [ ] SuperAdmin puede ejecutar todos los comandos

**Concurrencia:**
- [ ] Dos admins aprueban el mismo canje simultáneamente → solo uno debe procesar
- [ ] Usuario envía 10 mensajes en 1 segundo → todos se procesan correctamente

---

## 11. DOCUMENTACIÓN REQUERIDA

### Para Desarrolladores:
- README con instrucciones de instalación
- Guía de creación de nuevos comandos
- Documentación de estructura de BD
- Variables de entorno necesarias
- Guía de deployment

### Para Admins:
- Lista completa de comandos con ejemplos
- Guía de configuración de grupos
- Guía de gestión de recompensas
- FAQ de problemas comunes
- Mejores prácticas de moderación

---

## 12. RESUMEN DE ARQUITECTURA

```
📁 Proyecto
├── 📁 comandos/
│   ├── 📁 utility/
│   │   ├── ping.js
│   │   ├── help.js
│   │   └── info.js
│   ├── 📁 moderation/
│   │   ├── warn.js
│   │   ├── kick.js
│   │   └── tagall.js
│   ├── 📁 points/
│   │   ├── points.js
│   │   ├── level.js
│   │   └── leaderboard.js
│   ├── 📁 rewards/
│   │   ├── rewards.js
│   │   ├── redeem.js
│   │   └── myredemptions.js
│   └── 📁 admin/
│       ├── addreward.js
│       ├── approveredeem.js
│       └── setconfig.js
├── 📁 handlers/
│   ├── commandHandler.js
│   ├── eventHandler.js
│   └── messageHandler.js
├── 📁 utils/
│   ├── database.js
│   ├── permissions.js
│   └── levels.js
├── 📁 config/
│   └── firebaseConfig.js
├── .env
├── index.js
└── package.json
```

**Firestore:**
```
🗄️ Firestore
├── 📚 bot_config/
│   └── 📄 settings
├── 📚 groups/
│   └── 📄 {groupId}
│       ├── 📚 members/
│       │   └── 📄 {phone}
│       ├── 📚 messages/
│       │   └── 📄 {messageId}
│       ├── 📚 rewards/
│       │   └── 📄 {rewardId}
│       └── 📚 redemptions/
│           └── 📄 {redemptionId}
```

---

 