# Estilo de Mensajes del Bot
## Formatos
- Negrita: `*texto*`
- Cursiva: `_texto_`
- Tachado: `~texto~`
- Código en línea: `` `texto` ``
- Bloque de código: ``` (triple backtick)
- Lista con viñetas: `- texto`
- Lista numerada: `1. texto`
- Cita de bloque: `> texto`

## Menciones
- En el texto: `@id` (número o LID sin sufijo).
- En `options.mentions`: incluir `Contact` o JID serializado.

## Utilidad
- Usar `src/utils/message-builder.ts` para construir respuestas formateadas.

