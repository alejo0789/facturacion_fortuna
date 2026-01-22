# Guía de Instalación y Despliegue

## 📋 Requisitos del Sistema

### Servidor de Producción

**Sistema Operativo:**
- Windows Server 2016 o superior
- Ubuntu Server 20.04 LTS o superior (alternativa)

**Hardware Mínimo:**
- CPU: 4 cores
- RAM: 8 GB
- Disco: 100 GB SSD
- Red: 100 Mbps

**Hardware Recomendado:**
- CPU: 8 cores
- RAM: 16 GB
- Disco: 250 GB SSD
- Red: 1 Gbps

### Software Requerido

**Backend:**
- Python 3.9 o superior
- PostgreSQL 13 o superior
- Acceso a Oracle Database (Manager ERP)

**Frontend:**
- Node.js 18 o superior
- npm 9 o superior

**Servidor Web:**
- Apache 2.4 o superior (con mod_proxy)
- IIS 10 o superior (alternativa Windows)

**Adicionales:**
- Git
- n8n (instalación separada)

## 🔧 Instalación en Desarrollo

### 1. Clonar Repositorio

```bash
git clone https://github.com/tu-org/langextract_ocr.git
cd langextract_ocr
```

### 2. Configurar Backend

```bash
cd backend

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Crear archivo .env
copy .env.example .env  # Windows
cp .env.example .env    # Linux/Mac
```

**Editar `.env`:**
```env
# PostgreSQL
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/facturacion_db

# Oracle (Manager ERP)
ORACLE_HOST=172.18.114.70
ORACLE_PORT=1521
ORACLE_SERVICE=MANAMED
ORACLE_USER=WMENDEZ
ORACLE_PASSWORD=your_password

# API Security
API_KEY=your_secure_api_key_here

# Red compartida (opcional en desarrollo)
NETWORK_SHARE_PATH=\\192.168.2.20\Facturas
```

**Crear base de datos:**
```bash
# Conectar a PostgreSQL
psql -U postgres

# Crear base de datos
CREATE DATABASE facturacion_db;
CREATE USER facturacion_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE facturacion_db TO facturacion_user;
\q
```

**Ejecutar migraciones:**
```bash
# El sistema crea tablas automáticamente al iniciar
python main.py
```

### 3. Configurar Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Crear archivo .env
copy .env.example .env  # Windows
cp .env.example .env    # Linux/Mac
```

**Editar `.env`:**
```env
VITE_API_URL=http://localhost:8000/api
```

### 4. Ejecutar en Desarrollo

**Terminal 1 - Backend:**
```bash
cd backend
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac
python main.py
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Acceder:**
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Documentación API: `http://localhost:8000/docs`

## 🚀 Despliegue en Producción (Windows Server)

### 1. Preparar Servidor

```powershell
# Instalar Python
# Descargar desde python.org e instalar

# Instalar Node.js
# Descargar desde nodejs.org e instalar

# Instalar PostgreSQL
# Descargar desde postgresql.org e instalar

# Instalar Git
# Descargar desde git-scm.com e instalar

# Instalar Apache
# Descargar desde apachelounge.com
```

### 2. Clonar y Configurar Proyecto

```powershell
cd C:\inetpub\
git clone https://github.com/tu-org/langextract_ocr.git
cd langextract_ocr
```

### 3. Configurar Backend como Servicio

**Instalar NSSM (Non-Sucking Service Manager):**
```powershell
# Descargar NSSM desde nssm.cc
# Extraer a C:\nssm\

# Crear servicio
C:\nssm\nssm.exe install FacturacionAPI
```

**Configurar servicio en NSSM GUI:**
- Path: `C:\inetpub\langextract_ocr\backend\venv\Scripts\python.exe`
- Startup directory: `C:\inetpub\langextract_ocr\backend`
- Arguments: `main.py`
- Service name: `FacturacionAPI`

**Variables de entorno en NSSM:**
```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/facturacion_db
ORACLE_HOST=172.18.114.70
API_KEY=production_api_key
```

**Iniciar servicio:**
```powershell
net start FacturacionAPI
```

### 4. Build del Frontend

```powershell
cd C:\inetpub\langextract_ocr\frontend

# Configurar .env.production
echo VITE_API_URL=https://saman.lafortuna.com.co/api > .env.production

# Build
npm run build
```

### 5. Configurar Apache

**Archivo: `C:\Apache24\conf\extra\httpd-vhosts.conf`**

```apache
<VirtualHost *:443>
    ServerName saman.lafortuna.com.co
    
    # SSL Configuration
    SSLEngine on
    SSLCertificateFile "C:/Apache24/conf/ssl/certificate.crt"
    SSLCertificateKeyFile "C:/Apache24/conf/ssl/private.key"
    
    # Frontend (React SPA)
    DocumentRoot "C:/inetpub/langextract_ocr/frontend/dist"
    <Directory "C:/inetpub/langextract_ocr/frontend/dist">
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        
        # SPA routing
        RewriteEngine On
        RewriteBase /facturacion_ia/
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /facturacion_ia/index.html [L]
    </Directory>
    
    # Backend API Proxy
    ProxyPreserveHost On
    ProxyPass /api http://localhost:8000/api
    ProxyPassReverse /api http://localhost:8000/api
    
    # n8n Proxy
    ProxyPass /n8n http://localhost:5678
    ProxyPassReverse /n8n http://localhost:5678
    
    # Logs
    ErrorLog "logs/facturacion-error.log"
    CustomLog "logs/facturacion-access.log" combined
</VirtualHost>
```

**Habilitar módulos necesarios:**
```powershell
# En httpd.conf, descomentar:
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule ssl_module modules/mod_ssl.so
```

**Reiniciar Apache:**
```powershell
httpd.exe -k restart
```

### 6. Configurar Firewall

```powershell
# Permitir Apache
New-NetFirewallRule -DisplayName "Apache HTTP" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Apache HTTPS" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow

# Permitir PostgreSQL (solo local)
New-NetFirewallRule -DisplayName "PostgreSQL" -Direction Inbound -LocalPort 5432 -Protocol TCP -Action Allow -RemoteAddress LocalSubnet
```

### 7. Configurar Acceso a Red Compartida

**Para que el servicio acceda a `\\192.168.2.20\Facturas`:**

1. Crear usuario de servicio con permisos
2. Configurar NSSM para usar ese usuario:
   - NSSM → Edit service → Log on
   - Seleccionar "This account"
   - Ingresar credenciales

## 🐧 Despliegue en Linux (Ubuntu)

### 1. Instalar Dependencias

```bash
sudo apt update
sudo apt install -y python3.9 python3-pip python3-venv
sudo apt install -y postgresql postgresql-contrib
sudo apt install -y nodejs npm
sudo apt install -y apache2
sudo apt install -y git
```

### 2. Configurar PostgreSQL

```bash
sudo -u postgres psql

CREATE DATABASE facturacion_db;
CREATE USER facturacion_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE facturacion_db TO facturacion_user;
\q
```

### 3. Clonar y Configurar

```bash
cd /var/www/
sudo git clone https://github.com/tu-org/langextract_ocr.git
cd langextract_ocr

# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Crear .env
sudo nano .env
# (Configurar variables)

# Frontend
cd ../frontend
npm install
npm run build
```

### 4. Configurar Systemd Service

**Archivo: `/etc/systemd/system/facturacion-api.service`**

```ini
[Unit]
Description=Facturacion API Service
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/langextract_ocr/backend
Environment="PATH=/var/www/langextract_ocr/backend/venv/bin"
ExecStart=/var/www/langextract_ocr/backend/venv/bin/python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Habilitar e iniciar:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable facturacion-api
sudo systemctl start facturacion-api
sudo systemctl status facturacion-api
```

### 5. Configurar Apache

**Archivo: `/etc/apache2/sites-available/facturacion.conf`**

```apache
<VirtualHost *:443>
    ServerName saman.lafortuna.com.co
    
    SSLEngine on
    SSLCertificateFile /etc/ssl/certs/certificate.crt
    SSLCertificateKeyFile /etc/ssl/private/private.key
    
    DocumentRoot /var/www/langextract_ocr/frontend/dist
    
    <Directory /var/www/langextract_ocr/frontend/dist>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        
        RewriteEngine On
        RewriteBase /facturacion_ia/
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /facturacion_ia/index.html [L]
    </Directory>
    
    ProxyPreserveHost On
    ProxyPass /api http://localhost:8000/api
    ProxyPassReverse /api http://localhost:8000/api
    
    ErrorLog ${APACHE_LOG_DIR}/facturacion-error.log
    CustomLog ${APACHE_LOG_DIR}/facturacion-access.log combined
</VirtualHost>
```

**Habilitar módulos y sitio:**
```bash
sudo a2enmod proxy proxy_http rewrite ssl
sudo a2ensite facturacion
sudo systemctl restart apache2
```

## 🔒 Seguridad

### Checklist de Seguridad

- [ ] Cambiar API_KEY por defecto
- [ ] Usar HTTPS en producción
- [ ] Configurar firewall
- [ ] Restringir acceso a PostgreSQL
- [ ] Usar credenciales fuertes
- [ ] Habilitar logs de auditoría
- [ ] Configurar backups automáticos
- [ ] Actualizar dependencias regularmente

### Configurar SSL

**Obtener certificado (Let's Encrypt):**
```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d saman.lafortuna.com.co
```

## 📊 Monitoreo

### Logs a Revisar

**Backend:**
- Windows: Visor de Eventos → Servicios
- Linux: `sudo journalctl -u facturacion-api -f`

**Apache:**
- Windows: `C:\Apache24\logs\`
- Linux: `/var/log/apache2/`

**PostgreSQL:**
- Windows: `C:\Program Files\PostgreSQL\13\data\log\`
- Linux: `/var/log/postgresql/`

### Métricas Importantes

- Tiempo de respuesta API
- Uso de CPU y RAM
- Espacio en disco
- Conexiones a base de datos
- Errores en logs

## 🔄 Actualización

### Actualizar Código

```bash
cd /var/www/langextract_ocr
git pull origin main

# Backend
cd backend
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart facturacion-api

# Frontend
cd ../frontend
npm install
npm run build
sudo systemctl reload apache2
```

## 🆘 Troubleshooting

### Backend no inicia

```bash
# Verificar logs
sudo journalctl -u facturacion-api -n 50

# Verificar puerto
sudo netstat -tulpn | grep 8000

# Verificar permisos
ls -la /var/www/langextract_ocr/backend
```

### Error de conexión a PostgreSQL

```bash
# Verificar servicio
sudo systemctl status postgresql

# Verificar conexión
psql -U facturacion_user -d facturacion_db -h localhost

# Verificar pg_hba.conf
sudo nano /etc/postgresql/13/main/pg_hba.conf
```

### Frontend no carga

```bash
# Verificar build
ls -la /var/www/langextract_ocr/frontend/dist

# Verificar Apache
sudo systemctl status apache2
sudo apache2ctl configtest

# Verificar permisos
sudo chown -R www-data:www-data /var/www/langextract_ocr/frontend/dist
```

---

**Documentación completa creada exitosamente** ✅
