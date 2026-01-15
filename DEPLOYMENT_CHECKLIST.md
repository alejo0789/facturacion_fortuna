# Checklist de Despliegue en Producción

## Archivos que deben estar en el servidor

### Backend - Estructura de carpetas:
```
backend/
├── main.py
├── database.py
├── models.py
├── schemas.py
├── crud.py
├── oracle_database.py
├── .env                    # ⚠️ IMPORTANTE: Configurar con valores de producción
├── middleware/
│   ├── __init__.py        # ⚠️ DEBE EXISTIR (puede estar vacío)
│   └── auth.py
└── routers/
    ├── __init__.py
    ├── contracts.py
    ├── payments.py
    ├── facturas.py
    ├── consolidado.py
    ├── reportes.py
    ├── oficinas_oracle.py
    └── archivo_plano.py
```

## Pasos para Desplegar

### 1. Copiar archivos al servidor

**Opción A: SCP (desde Windows)**
```bash
# Copiar toda la carpeta backend
scp -r backend/ user@server:/path/to/backend/

# O copiar solo la carpeta middleware si ya existe el resto
scp -r backend/middleware/ user@server:/path/to/backend/middleware/
```

**Opción B: Git (Recomendado)**
```bash
# En el servidor
cd /path/to/backend
git pull origin main
```

**Opción C: Manual**
1. Conectarse al servidor por SSH o FTP
2. Crear carpeta `middleware` en el directorio backend
3. Copiar `__init__.py` y `auth.py` a esa carpeta

### 2. Verificar estructura en el servidor

```bash
# Conectarse al servidor
ssh user@server

# Ir al directorio backend
cd /path/to/backend

# Verificar que middleware existe
ls -la middleware/

# Deberías ver:
# __init__.py
# auth.py
```

### 3. Verificar permisos

```bash
# Asegurarse de que los archivos sean legibles
chmod 644 middleware/*.py
```

### 4. Verificar variables de entorno

```bash
# Verificar que .env existe y tiene API_KEY
cat .env | grep API_KEY

# Debería mostrar:
# API_KEY=tu_clave_secreta
```

### 5. Reiniciar el backend

```bash
# Si usas systemd
sudo systemctl restart facturacion-backend

# Si usas screen/tmux
# Detener el proceso actual (Ctrl+C)
# Luego:
uvicorn main:app --host 0.0.0.0 --port 8000

# O con gunicorn (recomendado para producción)
gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### 6. Verificar logs

```bash
# Ver logs en tiempo real
tail -f /var/log/facturacion-backend.log

# O si usas systemd
journalctl -u facturacion-backend -f

# Deberías ver:
# INFO:middleware.auth:API Key cargada: fortuna_...
```

### 7. Probar desde el navegador

1. Abrir: `https://saman.lafortuna.com.co/facturacion_ia/`
2. Abrir la consola del navegador (F12)
3. Verificar que no haya errores 401 o 403
4. Verificar que las peticiones funcionen

## Troubleshooting

### Error: "No module named 'middleware'"

**Causa**: La carpeta `middleware` no existe o no tiene `__init__.py`

**Solución**:
```bash
# En el servidor
cd /path/to/backend
mkdir -p middleware
touch middleware/__init__.py
# Copiar auth.py a middleware/
```

### Error: "API Key requerida"

**Causa**: El frontend no está enviando el header X-API-Key

**Solución**:
1. Verificar que `.env.production` en frontend tenga `VITE_API_KEY`
2. Rebuild del frontend: `npm run build`
3. Verificar en la consola del navegador que se vea: "✅ Interceptor de API Key configurado"

### Error: "API Key inválida"

**Causa**: La API Key del frontend y backend no coinciden

**Solución**:
1. Verificar backend: `cat /path/to/backend/.env | grep API_KEY`
2. Verificar frontend: `cat /path/to/frontend/.env.production | grep VITE_API_KEY`
3. Deben ser idénticas

### El middleware no se ejecuta

**Causa**: Error en el código o no se reinició el servidor

**Solución**:
1. Verificar logs de error: `journalctl -u facturacion-backend -n 50`
2. Verificar sintaxis: `python -m py_compile middleware/auth.py`
3. Reiniciar el servidor

## Comandos Útiles

### Verificar que el backend está corriendo
```bash
ps aux | grep uvicorn
# o
ps aux | grep gunicorn
```

### Verificar puerto 8000
```bash
netstat -tlnp | grep 8000
# o
ss -tlnp | grep 8000
```

### Probar API directamente
```bash
# Sin API Key (debería fallar)
curl http://localhost:8000/api/contratos/

# Con API Key (debería funcionar)
curl -H "X-API-Key: tu_clave_secreta" http://localhost:8000/api/contratos/
```

### Ver logs en tiempo real
```bash
# Si usas systemd
journalctl -u facturacion-backend -f

# Si usas archivo de log
tail -f /var/log/facturacion-backend.log

# Si corres manualmente
# Los logs aparecen en la terminal
```

## Configuración de Systemd (Recomendado)

Crear archivo `/etc/systemd/system/facturacion-backend.service`:

```ini
[Unit]
Description=Facturacion Backend API
After=network.target

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/path/to/backend
Environment="PATH=/path/to/backend/venv/bin"
ExecStart=/path/to/backend/venv/bin/gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
Restart=always

[Install]
WantedBy=multi-user.target
```

Luego:
```bash
sudo systemctl daemon-reload
sudo systemctl enable facturacion-backend
sudo systemctl start facturacion-backend
sudo systemctl status facturacion-backend
```
