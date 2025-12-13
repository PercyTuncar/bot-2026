# Operación Local con PM2
## Comandos
- `npm install`
- `npm run pm2:start`
- `npm run pm2:restart`
- `npm run pm2:stop`
- `pm2 status`, `pm2 logs whatsapp-bot`, `pm2 monit`

## Configuración
- `ecosystem.config.cjs`: `script: dist/index.js`, `cwd`, logs y entorno.
- `.env`: variables necesarias (Firebase, Cloudinary, opciones de features).

## Troubleshooting
- Reautenticación: borrar `.wwebjs_auth` si hay fallo grave.
- Verificar credenciales Firebase en `config.firebase.credentialsPath`.
- Revisar logs de PM2 en `logs/`.

