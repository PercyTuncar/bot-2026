# Sistema de Comandos
## Interfaz
- `name`, `description`, `usage`, `aliases`, `category`, `permissions`, `scope`, `cooldown`, `execute(context)`.

## Carga y despacho
- Carga dinámica por categorías.
- `MessageRouter` extrae contexto.
- `CommandDispatcher` valida y ejecuta.

## Estilo de respuestas
- Usar formato WhatsApp: `*negrita*`, `_cursiva_`, `~tachado~`, `` `codigo` ``, listas y `> citas`.
- Incluir menciones en texto (`@id`) y en `options.mentions`.

## Ejemplo
```
.ping
```
Responde:
```
*PING* 
- Latencia: 120ms
```

