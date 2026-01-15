# Guía de Despliegue en Producción - Facturación IA

## Configuración Actual

- **Dominio**: https://saman.lafortuna.com.co
- **Path Base**: /facturacion_ia/
- **Servidor Backend**: 192.168.2.91:8000
- **Servidor Frontend**: 192.168.2.91:5173

## Problema Resuelto

El error "Permission was denied for this request to access the `unknown` address space" ocurre porque:
- El frontend se sirve desde HTTPS (saman.lafortuna.com.co)
- El backend está en HTTP en una IP privada (192.168.2.91:8000)
- Los navegadores modernos bloquean peticiones desde HTTPS público a HTTP privado

## Solución Implementada

### 1. Frontend - Configuración de Rutas

**Archivos modificados:**
- `vite.config.ts`: Agregado `base: '/facturacion_ia/'`
- `App.tsx`: Agregado `basename="/facturacion_ia"` al BrowserRouter
- `.env.production`: API URL apunta a `https://saman.lafortuna.com.co/api`

### 2. Backend - CORS

**Archivo modificado:** `main.py`
- Agregados orígenes permitidos específicos
- Incluido `https://saman.lafortuna.com.co`

### 3. Apache - Configuración del Proxy

**Archivo:** `apache_config_production.conf`

La configuración hace que:
- Frontend: `https://saman.lafortuna.com.co/facturacion_ia/` → `http://192.168.2.91:5173/`
- Backend: `https://saman.lafortuna.com.co/api/` → `http://192.168.2.91:8000/api/`

Ambos servicios se acceden a través del mismo dominio HTTPS, evitando problemas de CORS.

## Pasos para Desplegar

### En el servidor CentOS:

1. **Copiar configuración de Apache:**
   ```bash
   sudo cp apache_config_production.conf /etc/httpd/conf.d/facturacion_ia.conf
   ```

2. **Editar el archivo para agregar rutas SSL correctas:**
   ```bash
   sudo nano /etc/httpd/conf.d/facturacion_ia.conf
   # Actualizar las rutas de los certificados SSL
   ```

3. **Habilitar módulos necesarios de Apache:**
   ```bash
   sudo a2enmod proxy
   sudo a2enmod proxy_http
   sudo a2enmod proxy_wstunnel
   sudo a2enmod rewrite
   sudo a2enmod headers
   sudo a2enmod ssl
   ```

4. **Verificar configuración:**
   ```bash
   sudo apachectl configtest
   ```

5. **Reiniciar Apache:**
   ```bash
   sudo systemctl restart httpd
   ```

### En tu máquina de desarrollo (Windows):

6. **Build del frontend para producción:**
   ```bash
   cd frontend
   npm run build
   ```

7. **Copiar archivos build al servidor:**
   ```bash
   # Opción 1: SCP
   scp -r dist/* user@server:/path/to/frontend/

   # Opción 2: Usar el servidor de desarrollo en producción (NO RECOMENDADO para producción final)
   # Solo para pruebas, ejecutar en el servidor:
   npm run dev -- --host 0.0.0.0
   ```

8. **Iniciar backend en el servidor:**
   ```bash
   cd backend
   source venv/bin/activate  # o el path de tu virtualenv
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

## Producción Final (Recomendado)

Para producción, deberías:

1. **Usar Nginx o servir archivos estáticos desde Apache:**
   ```apache
   # En lugar de proxy al dev server de Vite
   DocumentRoot /var/www/facturacion_ia/dist
   <Directory /var/www/facturacion_ia/dist>
       Options -Indexes +FollowSymLinks
       AllowOverride All
       Require all granted
       
       # React Router - todas las rutas van a index.html
       RewriteEngine On
       RewriteBase /facturacion_ia/
       RewriteRule ^index\.html$ - [L]
       RewriteCond %{REQUEST_FILENAME} !-f
       RewriteCond %{REQUEST_FILENAME} !-d
       RewriteRule . /facturacion_ia/index.html [L]
   </Directory>
   ```

2. **Usar Gunicorn o similar para el backend:**
   ```bash
   gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
   ```

3. **Configurar systemd para auto-inicio:**
   ```bash
   sudo nano /etc/systemd/system/facturacion-backend.service
   ```

## Verificación

1. Accede a: `https://saman.lafortuna.com.co/facturacion_ia/`
2. Verifica que no haya errores de CORS en la consola del navegador
3. Verifica que las peticiones API vayan a `https://saman.lafortuna.com.co/api/`

## Troubleshooting

- **Error 502 Bad Gateway**: El backend no está corriendo o no es accesible
- **Error 404**: Verifica las rutas en Apache y que el base path esté correcto
- **CORS errors**: Verifica que el backend tenga el dominio en allow_origins
- **WebSocket errors**: Asegúrate de que mod_proxy_wstunnel esté habilitado
