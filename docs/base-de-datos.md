# Base de Datos (Firestore)
## Esquema
- `groups/{groupId}`
  - `members/{phone}`: identidad unificada (`phone` docId, `lid` auxiliar).
  - `messages/{id}`: historial y contadores.
  - `redemptions/{id}`: canjes y estados.
  - `config`: configuración de grupo.

## Patrones
- Repositorio por colección.
- `set(..., { merge: true })` para actualizaciones seguras.
- Transacciones para operaciones multi-colección.

## Índices
- `members: points DESC` para ranking.
- Documentar índices compuestos necesarios.

