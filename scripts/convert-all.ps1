# Conversión masiva de .js a .ts

$srcDir = "src"
$converted = 0
$errors = 0

# Archivos ya convertidos manualmente (saltarlos)
$skip = @(
    "config\environment.ts",
    "config\constants.ts",
    "config\firebase.ts",
    "lib\logger.ts",
    "lib\qr-handler.ts",
    "utils\phone.ts",
    "utils\time.ts",
    "types\index.ts",
    "types\whatsapp.types.ts",
    "types\firestore.types.ts",
    "types\command.types.ts"
)

Get-ChildItem -Path $srcDir -Filter "*.js" -Recurse | ForEach-Object {
    $jsFile = $_.FullName
    $tsFile = $jsFile -replace '\.js$', '.ts'
    $relativePath = $jsFile -replace [regex]::Escape($PWD.Path + "\src\"), "" -replace "\\", "/"
    $relativeTsPath = $relativePath -replace '\.js$', '.ts'
    
    # Saltar archivos ya convertidos
    if ($skip -contains $relativeTsPath) {
        Write-Host "⏭️  Saltado: $relativePath (ya convertido manualmente)" -ForegroundColor Yellow
        return
    }
    
    try {
        # Leer contenido
        $content = Get-Content -Path $jsFile -Raw -Encoding UTF8
        
        # Conversiones básicas
        # Mantener .js en imports (ESM TypeScript lo requiere)
        # $content = $content -replace "from\s+['""](.+?)\.js['""]", "from '$1.js'"
        
        # Escribir archivo TS
        Set-Content -Path $tsFile -Value $content -Encoding UTF8
        
        Write-Host "✅ $relativePath → $relativeTsPath" -ForegroundColor Green
        $converted++
    }
    catch {
        Write-Host "❌ Error en $relativePath : $($_.Exception.Message)" -ForegroundColor Red
        $errors++
    }
}

Write-Host "`n✨ Conversión completada:" -ForegroundColor Cyan
Write-Host "   📄 Archivos convertidos: $converted" -ForegroundColor Green
Write-Host "   ❌ Errores: $errors" -ForegroundColor $(if ($errors -gt 0) { "Red" } else { "Green" })
Write-Host "`n⚠️  Ahora ejecuta: npm run build" -ForegroundColor Yellow
Write-Host "   Y revisa los errores de compilación TypeScript" -ForegroundColor Yellow
