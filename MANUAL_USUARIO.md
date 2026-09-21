# Manual de usuario — Facturación Fortuna

Guía práctica para operar el SaaS contable de principio a fin. Sigue el orden si es tu primer día; usa el índice si vienes a resolver un flujo puntual.

---

## Índice

1. [Qué es Facturación Fortuna y para quién](#1-qué-es-facturación-fortuna-y-para-quién)
2. [Antes de empezar](#2-antes-de-empezar)
3. [Primer ingreso a la plataforma](#3-primer-ingreso-a-la-plataforma)
4. [Configuración inicial (una sola vez)](#4-configuración-inicial-una-sola-vez)
5. [Maestros del día a día](#5-maestros-del-día-a-día)
6. [Facturación de proveedores](#6-facturación-de-proveedores)
7. [Contabilidad](#7-contabilidad)
8. [Pagos](#8-pagos)
9. [Bancos y conciliación bancaria](#9-bancos-y-conciliación-bancaria)
10. [Cumplimiento DIAN](#10-cumplimiento-dian)
11. [Reportes](#11-reportes)
12. [Roles y multi-empresa](#12-roles-y-multi-empresa)
13. [Seguridad](#13-seguridad)
14. [Recorrido guiado con las facturas de ejemplo](#14-recorrido-guiado-con-las-facturas-de-ejemplo)
15. [Glosario contable](#15-glosario-contable)
16. [Preguntas frecuentes](#16-preguntas-frecuentes)

---

## 1. Qué es Facturación Fortuna y para quién

Facturación Fortuna es una plataforma en la nube para llevar la facturación de proveedores, la contabilidad y el cumplimiento tributario de una o varias empresas colombianas. Fue diseñada para dos casos de uso:

- Una **firma contable** que administra la contabilidad de varios clientes. La firma opera una sola cuenta y crea una empresa (tenant) por cada cliente. Los datos quedan aislados por empresa.
- Una **empresa individual** que quiere centralizar factura de compra, contabilidad, pagos y DIAN en una sola herramienta.

Cubre el ciclo completo:

- Recibir facturas de proveedores por correo o subirlas manualmente.
- Extraer los datos con IA (Google Gemini) y guardarlas en el sistema.
- Contabilizar cada factura contra el PUC colombiano (Decreto 2650), con cálculo automático de IVA y retenciones.
- Registrar pagos y generar el documento contable NB01 compatible con Oracle MANAMED.
- Conciliar el extracto bancario contra los asientos.
- Preparar los medios magnéticos (formatos 1001, 1007, 1008) y la conciliación de factura electrónica contra el portal DIAN.

No sustituye a un contador. Automatiza el trabajo repetitivo (tipeo, cálculo de impuestos, cruce bancario) para que el contador se concentre en revisar, aprobar y firmar.

---

## 2. Antes de empezar

Necesitas:

- Un navegador moderno (Chrome, Edge o Firefox actualizado).
- Un correo de acceso al superadmin de tu cuenta (te lo entregó el administrador del SaaS).
- La contraseña temporal, si es tu primer login.
- Idealmente, un gestor de contraseñas (Bitwarden, 1Password) para guardar la nueva contraseña que vas a definir.

Datos que conviene tener a la mano para la configuración inicial:

- NIT de tu empresa y dígito de verificación.
- Direcciones y datos de las sedes u oficinas físicas si vas a distribuir gastos por centro de costo.
- Cuentas bancarias con sus dígitos, banco y tipo (corriente o ahorros).
- Si vas a usar captura automática por correo: una cuenta de Gmail o de Outlook a la que llegan las facturas.

---

## 3. Primer ingreso a la plataforma

1. Abre `https://app.movaiti.com` (o la URL que te dio el administrador). Verás la landing page.
2. Click en **Iniciar sesión** arriba a la derecha.
3. Ingresa tu correo y la contraseña temporal. Click en **Entrar**.
4. Al primer login te lleva al dashboard. Vas a ver un layout con:
   - **Sidebar izquierdo**: navegación por módulos.
   - **Área central**: contenido del módulo activo.
   - **Panel inferior del sidebar**: selector de empresa activa y tu perfil de usuario.

### 3.1 Cambia la contraseña temporal

Ve a la esquina inferior izquierda, click sobre tu nombre → **Cambiar contraseña**. La contraseña nueva debe tener al menos 12 caracteres, con mayúsculas, minúsculas, números y símbolos.

### 3.2 Activa el segundo factor de autenticación (2FA)

Sidebar → **Seguridad (2FA)**. Descarga Google Authenticator, Authy o el gestor de contraseñas que uses en el celular. Escanea el código QR, ingresa el código de 6 dígitos y confirma. Desde el próximo login te pedirá el TOTP además de la contraseña.

No lo saltes. Si te roban la contraseña, sin el segundo factor la cuenta queda expuesta.

### 3.3 Verifica que la empresa activa es la correcta

En la parte inferior del sidebar aparece **EMPRESA ACTIVA** con el nombre y NIT. Si administras más de una empresa (típico en una firma contable), aquí eliges cuál estás viendo. Todos los datos de las páginas siguientes son de la empresa seleccionada. Cambiar la empresa activa cambia el contexto entero: proveedores, facturas, contabilidad, todo.

---

## 4. Configuración inicial (una sola vez)

Estos pasos se hacen la primera vez que se pone en marcha una empresa. Después no los tocas salvo para agregar cosas nuevas.

### 4.1 Revisar la empresa y la firma

Sidebar → **Mi equipo** (o el módulo que se llame así en tu build). Ahí verás:

- El nombre y NIT de tu firma.
- La lista de empresas que administra la firma.
- Los usuarios que tienen acceso a cada empresa y su rol.

Si acabas de recibir la cuenta, la firma y la empresa por defecto ya están creadas con los datos que ingresaste al registrarte (o los que el operador del SaaS puso en el seed inicial). Confirma que estén correctos.

### 4.2 PUC colombiano

Sidebar → **PUC** (Plan Único de Cuentas). El sistema clona automáticamente el PUC colombiano estándar (Decreto 2650, aproximadamente 167 cuentas base) a cada empresa nueva. Debes ver esa lista poblada.

Las cuentas se agrupan por clase:

- Clase 1 — Activo
- Clase 2 — Pasivo
- Clase 3 — Patrimonio
- Clase 4 — Ingresos
- Clase 5 — Gastos operacionales
- Clase 6 — Costo de ventas
- Clase 7 — Costos de producción
- Clase 8 — Cuentas de orden deudoras
- Clase 9 — Cuentas de orden acreedoras

Puedes agregar subcuentas desde el catálogo del PUC oficial. Ejemplo típico: la cuenta 511005 (gastos honorarios profesionales) puede necesitar subcuentas por área (contable, jurídica, técnica). Click **+ Agregar cuenta desde catálogo** y busca por código o descripción.

No borres cuentas. Si una cuenta no la usas, simplemente ignórala. Borrarla te romperá reportes históricos si más adelante recibes un asiento que la referenciaba.

### 4.3 Impuestos y tarifas

Sidebar → **Impuestos**. El sistema trae precargadas las tarifas 2026:

- **IVA 19%** general (con excepciones por tipo de bien o servicio).
- **Retefuente** por concepto (compras 2.5%, servicios 4%, honorarios 10-11%, arrendamientos 3.5%, etc.).
- **ReteIVA 15%** del IVA (aplica solo si eres gran contribuyente o autorretenedor).
- **ReteICA** variable por municipio y actividad (Bogotá servicios 9.66 x mil, Cali comercio 11.04 x mil, y así).
- **UVT 2026**: $52.374.

Revisa que las tarifas coincidan con las vigentes y con el tratamiento tributario de tu empresa. Si tu empresa no es autorretenedora de ICA, desactiva o ajusta la tarifa para que no aparezca en las facturas.

### 4.4 Oficinas y centros de costo

Sidebar → **Oficinas**. Aquí registras las sedes físicas o los centros de costo internos por los que se distribuyen los gastos. Ejemplos:

- Sede principal Cali.
- Sucursal Bogotá.
- Centro de costo Administración.
- Centro de costo Ventas.
- Centro de costo Producción.

Cada factura puede repartirse entre varias oficinas con un porcentaje. Ejemplo: una factura de energía puede ir 60% Administración, 40% Producción.

Para registrar una oficina nueva: click **+ Nueva oficina** → nombre, dirección, ciudad, y opcionalmente la cuenta PUC de gasto principal. **Guardar**.

### 4.5 Cuentas bancarias

Sidebar → **Cuentas bancarias**. Registra cada cuenta física que maneja la empresa:

- Nombre del banco (Bancolombia, Davivienda, BBVA, etc.).
- Número de cuenta.
- Tipo (Corriente / Ahorros).
- Cuenta PUC asociada (típicamente en el grupo 1110 — Bancos). Si no existe la subcuenta específica, agrégala primero desde el módulo PUC.

Ejemplo:
- Bancolombia Corriente 001-234567-89 → PUC 111005 (Bancos nacionales Bancolombia).
- Davivienda Ahorros 04-000123-4 → PUC 111010 (Bancos nacionales Davivienda).

Esto es lo que le dice al sistema en qué cuenta PUC hacer el crédito cuando marcas una factura como pagada.

### 4.6 Integraciones (opcional pero recomendado)

Sidebar → **Integraciones**. Aquí conectas las herramientas externas que automatizan el trabajo:

- **Gmail**: click **Conectar Gmail**, autoriza con la cuenta que recibe las facturas. Alcance: solo lectura del inbox.
- **Outlook**: mismo flujo con la cuenta Microsoft.
- **Gemini AI**: normalmente ya está configurada globalmente por el operador del SaaS. Si necesitas usar tu propia API key (por privacidad de datos o volumen), la pegas en esta pantalla.

Sin estas integraciones puedes trabajar cargando cada PDF manualmente. Con ellas, el sistema busca facturas en tu inbox y las procesa solo.

Al cabo de esto, la configuración base queda hecha. Los siguientes pasos son operativos.

---

## 5. Maestros del día a día

### 5.1 Proveedores

Sidebar → **Proveedores**. Aquí registras a quienes te facturan.

Para crear uno nuevo: click **+ Nuevo proveedor**. Campos:

- NIT con dígito de verificación (ej. `901234567-1`).
- Razón social.
- Ciudad y dirección.
- Contacto: nombre, correo, teléfono.
- Régimen tributario: Ordinario, Simple, No responsable de IVA, Gran contribuyente. Esta clasificación afecta las retenciones que se calculan.
- Tipo de proveedor: Nacional / Exterior. Los del exterior se manejan diferente (retenciones especiales, tasa de cambio).
- Cuenta PUC de gasto por defecto (opcional). Si la defines, cada nueva factura la sugiere.

El NIT es único por empresa: no puedes tener dos proveedores con el mismo NIT dentro de la misma empresa. Puedes tener el mismo NIT en dos empresas distintas (son tenants independientes).

Nota importante: el sistema puede crear proveedores automáticamente cuando llega una factura por correo con un NIT que no existe todavía. Después revisas los datos y los completas.

### 5.2 Contratos

Sidebar → **Contratos**. Registra contratos recurrentes: arrendamientos, mantenimientos, servicios mensuales, licencias.

Un contrato tiene:

- Proveedor asociado.
- Fecha de inicio y fin.
- Valor mensual o total.
- Frecuencia (mensual, trimestral, anual).
- Cuenta PUC de gasto.
- Estado (Vigente, Suspendido, Terminado).
- PDF del contrato firmado (opcional).

Beneficio: el módulo de **Facturas Pendientes por Llegar** (sidebar → **Facturas Pendientes**) usa la lista de contratos vigentes para avisarte qué facturas deberían haber llegado en el mes y no llegaron. Ideal para no dejar cuotas de arrendamiento o licencias sin registrar.

---

## 6. Facturación de proveedores

Hay tres formas de meter una factura al sistema. Elige la que te convenga según cómo llega el documento.

### 6.1 Carga manual — subir un PDF

Sidebar → **Facturas** → botón **+ Subir factura**.

1. Arrastra o selecciona el PDF de la factura.
2. Elige si querés que la IA extraiga los datos automáticamente (recomendado).
3. Click **Procesar**.
4. Espera 10-30 segundos. El sistema:
   - Guarda el PDF en el almacenamiento privado de tu empresa.
   - Manda el PDF a n8n + Gemini para extraer los campos.
   - Vuelve con el proveedor, número, fecha, valor y CUFE detectados.
   - Crea la factura en estado **PENDIENTE**.
5. Revisa los datos extraídos, corrige si hace falta, y guarda.

Si el proveedor no existía, el sistema lo crea con el NIT y nombre detectados. Vas a **Proveedores** y completas la ciudad, contacto y régimen tributario.

Errores comunes durante la carga:

- **"El modelo de IA está temporalmente sobrecargado. Intenta subir la factura de nuevo en 1-2 minutos."** El servicio Gemini de Google tiene picos. Espera y vuelve a intentar. Los datos del PDF ya se guardaron; solo hace falta re-procesar la extracción.
- **"Error conectando con el servicio de procesamiento."** El workflow de n8n está caído o no responde. Contacta al administrador del SaaS.
- **PDF con datos extraídos incorrectos.** Es común con facturas escaneadas de baja calidad. Edita los campos a mano; la factura queda igual creada.

### 6.2 Captura automática desde el correo

Requiere haber conectado Gmail u Outlook en Integraciones.

Sidebar → **Buscador**. Es un asistente que busca facturas en tu correo por rango de fechas.

1. Fecha inicial y fecha final: define el rango a explorar.
2. Correo (opcional): filtra por remitente. Útil si sabes de qué proveedor esperas facturas.
3. Click **Buscar**. El sistema conecta con Gmail/Outlook, filtra los correos con adjuntos PDF que parecen facturas, y te muestra una lista.
4. Marca los PDFs que quieres procesar.
5. Click **Procesar seleccionados**. Cada uno se manda al workflow igual que en la carga manual y termina como factura en estado PENDIENTE.

Ventajas frente a la carga manual:

- Procesa varios PDFs en tanda, uno tras otro.
- No tienes que descargar cada adjunto y volver a subirlo.
- Evita duplicados: si ya procesaste un correo (por su ID de mensaje), no lo vuelve a procesar.

### 6.3 n8n automatizado (avanzado)

Si conectas n8n con un trigger de correo programado (cada X minutos revisa el inbox), el sistema puede recibir facturas sin que nadie las suba. Este flujo lo configura el administrador del SaaS al inicio.

### 6.4 Estados de una factura

Cada factura pasa por tres estados:

- **PENDIENTE**: recién creada. Los datos pueden editarse. No genera asiento contable todavía.
- **APROBADA**: alguien con rol contable la revisó y confirmó. Al aprobarla se dispara la **causación** (asiento contable automático).
- **PAGADA**: el pago se registró y se generó el asiento de banco. Ya no se puede modificar.

Estados adicionales:
- **ANULADA**: se rechazó (típicamente por duplicado o error). No se puede volver a activar.

### 6.5 Distribución por oficinas

Antes de aprobar una factura, puedes distribuirla entre oficinas. En la vista de detalle: **Asignar oficinas** → agrega cada oficina con un porcentaje. La suma debe dar 100%.

Ejemplo: factura de arrendamiento de $4.200.000 dividida en:
- Sede principal Cali: 70% ($2.940.000)
- Sucursal Bogotá: 30% ($1.260.000)

Sin oficinas asignadas, la factura queda como gasto general de la empresa. Con oficinas, aparece en los reportes segmentados por centro de costo.

---

## 7. Contabilidad

### 7.1 Cómo funciona el motor contable

Facturación Fortuna usa **partida doble**: cada asiento tiene débitos y créditos que deben sumar exactamente igual. Si intentas guardar un asiento descuadrado, el sistema lo rechaza con HTTP 422.

Los asientos se agrupan en **periodos contables** (uno por mes). Cuando un periodo se cierra, los asientos aprobados de ese mes ya no se pueden modificar.

Los asientos tienen tres estados:

- **BORRADOR**: recién creado, se puede editar.
- **APROBADO**: firmado por un contador. Alimenta los reportes y los medios magnéticos.
- **ANULADO**: se descartó (por error). Deja rastro pero no cuenta.

### 7.2 Periodos contables

Sidebar → **Asientos** → botón **Periodos**. Aquí ves la lista de periodos. Al iniciar el año, el sistema crea automáticamente los 12 meses.

- **Crear periodo**: si tu año fiscal empieza en otro mes o necesitas cerrar un periodo especial.
- **Cerrar periodo**: bloquea todos los asientos aprobados del mes. Los reportes DIAN y balances se hacen sobre periodos cerrados.

No cierres un periodo hasta que hayas conciliado el banco y aprobado todas las facturas de ese mes.

### 7.3 Causación automática

Cuando marcas una factura como **APROBADA**, el sistema crea automáticamente el asiento contable de causación. Ejemplo para una factura de honorarios de García & Asociados por $3.500.000 (subtotal), IVA 19%, retefuente 11%, ReteICA 9.66/1000 en Bogotá:

| Cuenta PUC | Concepto | Débito | Crédito |
|---|---|---|---|
| 511005 | Honorarios profesionales | 3.500.000 | |
| 240810 | IVA descontable | 665.000 | |
| 236525 | Retefuente por pagar (honorarios) | | 385.000 |
| 236805 | ReteICA por pagar | | 33.810 |
| 220505 | Proveedores nacionales | | 3.746.190 |

Total débitos = Total créditos = 4.165.000.

El asiento queda en estado APROBADO automáticamente. Si necesitas ajustar algo, tienes que anularlo y crear uno manual.

### 7.4 Asientos manuales

Para operaciones que no son causación de factura (nómina, cierre, ajustes, aperturas), Sidebar → **Asientos** → **+ Nuevo asiento**.

1. Fecha del asiento.
2. Concepto (texto libre, describe qué es).
3. Líneas: por cada línea, cuenta PUC, débito o crédito, valor, tercero (proveedor, cliente, empleado). Como mínimo 2 líneas.
4. La suma de débitos debe ser igual a la suma de créditos.
5. **Guardar**. Queda en BORRADOR.
6. Cuando estés seguro, **Aprobar**. Ya alimenta los reportes.

### 7.5 Libro mayor

Sidebar → **Libro mayor**. Para cualquier cuenta del PUC, muestra:

- Saldo inicial del periodo.
- Todos los movimientos del periodo (débitos y créditos).
- Saldo final.

Útil para trazar qué le pasó a la cuenta 220505 (Proveedores) durante mayo: qué factura la aumentó, qué pago la disminuyó.

### 7.6 Balance de comprobación

Sidebar → **Balance**. Muestra por cada cuenta PUC:

- Saldo inicial.
- Movimientos débito y crédito del periodo.
- Saldo final.

Al final aparece el balance general: Activo, Pasivo, Patrimonio. Debe cumplir `Activos = Pasivos + Patrimonio`. Si no cuadra, hay un asiento mal registrado o un asiento manual descuadrado.

---

## 8. Pagos

### 8.1 Registrar un pago

Sidebar → **Pagos** → botón **+ Registrar pago**, o desde la vista de detalle de una factura APROBADA click **Marcar como pagada**.

Campos:

- Factura (o facturas — puedes pagar varias del mismo proveedor en un solo pago).
- Fecha del pago.
- Cuenta bancaria desde la que sale el pago (una de las cuentas registradas en 4.5).
- Referencia bancaria (número de transacción del banco).
- Observaciones (opcional).

Al confirmar el pago, el sistema:

1. Cambia el estado de la factura a **PAGADA**.
2. Crea un asiento contable de pago:

| Cuenta PUC | Concepto | Débito | Crédito |
|---|---|---|---|
| 220505 | Proveedores nacionales | 3.746.190 | |
| 111005 | Bancolombia Corriente | | 3.746.190 |

Esto anula la deuda con el proveedor y disminuye el saldo del banco.

### 8.2 Documento NB01 para MANAMED

Si tu empresa usa Oracle MANAMED como ERP paralelo, el sistema genera automáticamente un archivo NB01 (nota bancaria) cada vez que registras un pago. Ese archivo tiene el formato que MANAMED consume para registrar el pago en su contabilidad. Se descarga desde el detalle del pago → **Descargar NB01**.

Si no usas MANAMED, ignora esta función.

---

## 9. Bancos y conciliación bancaria

Este es el módulo que compara lo que tú registraste en el sistema contra lo que efectivamente pasó en el banco.

### 9.1 Cargar el extracto

Sidebar → **Conciliación bancaria** → **+ Cargar extracto**.

1. Selecciona la cuenta bancaria.
2. Sube el archivo del extracto. Formatos soportados: CSV, XLSX. El sistema detecta automáticamente si es Bancolombia, Davivienda o formato genérico.
3. Confirma. El extracto queda cargado con todas sus transacciones.

Si el mismo extracto ya fue cargado antes, el sistema lo detecta (hash del contenido) y no duplica las transacciones.

### 9.2 Motor de conciliación

En el detalle del extracto, click **Analizar**. El motor asigna a cada transacción bancaria un score de similitud contra las líneas de asiento del periodo:

| Condición | Puntos |
|---|---|
| Monto exactamente igual | +50 |
| Diferencia de monto ≤ 1% | +20 |
| Diferencia de fecha ≤ 3 días | +30 |
| Diferencia de fecha ≤ 7 días | +15 |
| NIT del proveedor coincide en la referencia | +20 |
| Nombre del proveedor aparece en la descripción | +10 |

- Score **≥ 100** → conciliado automáticamente. Cambia el estado del asiento a "conciliado con extracto".
- Score **70-99** → sugerido. Aparece una fila con la opción **Aprobar** o **Rechazar**.
- Score **< 70** → sin sugerencia. Puedes conciliar manualmente si la reconoces.

### 9.3 Reglas de conciliación

Sidebar → **Conciliación bancaria** → **Reglas**. Sirve para transacciones recurrentes que se saben de memoria: nómina, servicios públicos, impuestos.

Ejemplo de regla:

- Patrón (regex o texto): `NOMINA.*QUINCENA`
- Cuenta PUC destino: `510506` (Sueldos)
- Aplicar automáticamente: sí.

Cada nueva transacción del extracto que match ese patrón, se contabiliza sola sin necesidad de asiento previo.

---

## 10. Cumplimiento DIAN

Dos verticales separadas: Medios Magnéticos (información exógena anual) y Conciliación de factura electrónica (mensual).

### 10.1 Medios magnéticos (información exógena)

Sidebar → **Medios Magnéticos**. Al final del año fiscal, la DIAN te pide reportar los formatos 1001, 1007 y 1008.

- **Formato 1001** — Pagos y retenciones por tercero. Todo lo que le pagaste a alguien durante el año, con el desglose de retenciones aplicadas.
- **Formato 1007** — Ingresos por tercero. Todo lo que te pagaron.
- **Formato 1008** — Saldo de cuentas por cobrar al 31 de diciembre.

Cómo generar:

1. Elige el año fiscal.
2. Click **Generar 1001** / **1007** / **1008**.
3. Descarga el archivo (JSON o CSV, el que necesites).

El sistema calcula estos formatos en tiempo real sobre los asientos APROBADOS del año. No hay un archivo pre-generado; siempre refleja el estado actual de la contabilidad. Si cambias un asiento en enero de 2027, el 1001 de 2026 lo refleja.

### 10.2 Conciliación de factura electrónica DIAN

Sidebar → **Conciliación DIAN**. Cruza lo que la DIAN tiene registrado como factura electrónica emitida (o recibida por ti) contra lo que tienes en el sistema.

Requiere autenticarte contra el portal DIAN (`catalogo-vpfe.dian.gov.co`). Cuatro métodos:

| Método | Cuándo usarlo |
|---|---|
| Persona natural | Cuentas de persona natural con cédula |
| Administrador | Cuenta de administrador con email + password |
| Empresa · Representante legal | Empresa donde el rep legal se autentica con su cédula |
| Empresa · Usuario autorizado | Empresa con usuario delegado en la DIAN |

Las contraseñas de la DIAN **no se guardan**. Solo viven en memoria durante la sincronización.

**Cuatro tabs** en la página:

1. **Sincronizar**: dispara el job que abre el portal DIAN con Playwright, descarga tus facturas electrónicas del mes y las guarda. Puede pedirte pegar un magic link si tu método requiere segundo factor.
2. **Conciliación**: cruce factura app ↔ documento DIAN. Cada línea tiene un estado:
   - `coincide`: la factura de la app y el documento DIAN son iguales.
   - `diferencia_valor`: los NITs coinciden pero los valores no. Revísala.
   - `solo_en_app`: tú la registraste pero la DIAN no la tiene. Puede ser una factura no electrónica.
   - `solo_en_dian`: la DIAN la tiene pero no está en el sistema. Falta cargarla.
3. **IVA por período**: totales bimestrales, cuatrimestrales y anuales. Muestra el saldo entre IVA generado (ventas) e IVA descontable (compras). Positivo → pagas a la DIAN. Negativo → saldo a favor.
4. **IVA estratégico**: dashboard analítico con KPIs y recomendaciones:
   - Ratio de captura de IVA (qué porcentaje de tu IVA descontable estás efectivamente registrando).
   - Top 10 proveedores por IVA descontable.
   - Facturas huérfanas (aparecen en DIAN pero no en la app).
   - Recomendaciones heurísticas (adelantar compras si vas a pagar mucho IVA, radicar Art. 850 si tienes saldo a favor grande, etc.).

---

## 11. Reportes

Sidebar → **Reportes**. Lista de reportes precalculados sobre los datos aprobados:

- **Facturación mensual**: cuánto compraste cada mes.
- **Top proveedores**: los que más te facturan.
- **Estado de cartera**: qué facturas están pendientes de pago y desde hace cuánto.
- **Balance general**: activos vs pasivos + patrimonio.
- **Estado de resultados**: ingresos menos egresos del periodo.
- **Reporte de retenciones**: cuánto retuviste y a quién.

Cada uno se puede descargar en Excel o CSV.

---

## 12. Roles y multi-empresa

### 12.1 Roles

Cada usuario tiene un rol **por empresa**. Los roles disponibles:

| Rol | Acceso típico |
|---|---|
| ADMIN | Todo: usuarios, empresas, contabilidad, DIAN |
| CONTADOR | Contabilidad completa (PUC, asientos, balance, DIAN) |
| CONTABILIDAD | Operativo contable (asientos, conciliación) |
| AUDITOR | Solo lectura del sistema completo |
| FACTURACION | Alta de facturas, pagos, proveedores |
| PRODUCTOS | Catálogo de productos y servicios |
| VENTAS | Facturación de venta y clientes |
| SOLO_LECTURA | Lectura básica del dashboard y reportes |

Un usuario puede ser ADMIN en la empresa A y SOLO_LECTURA en la empresa B. Los roles se asignan por combinación usuario-empresa.

Para agregar un usuario nuevo: Sidebar → **Mi equipo** → **+ Invitar usuario**. Ingresa correo, rol y las empresas a las que tendrá acceso. Al usuario le llega un correo con el link de activación.

### 12.2 Cambiar de empresa activa

En la parte inferior del sidebar, click sobre el nombre de la empresa activa → selecciona otra del listado. Todos los datos que veas cambian al contexto de la empresa nueva.

### 12.3 Superadmin

El superadmin del SaaS ve todas las empresas del sistema, incluso aunque no esté en `usuario_empresa`. Es una cuenta de administración del operador (Movaiti), no una cuenta operativa de cliente. Los clientes reciben un ADMIN, no un superadmin.

---

## 13. Seguridad

### 13.1 Buenas prácticas

- Activa 2FA en tu cuenta (ver 3.2). El SaaS lo permite pero no lo obliga.
- Cambia la contraseña cada 6-12 meses.
- No compartas la cuenta. Cada usuario debe tener la suya.
- Revisa el módulo **Auditoría** (sidebar) periódicamente. Muestra todos los eventos sensibles: logins, cambios de rol, rotación de API keys, sincronizaciones DIAN, cambios de OAuth.

### 13.2 Contraseñas

- Mínimo 12 caracteres, con mayúsculas, minúsculas, números y símbolos.
- El sistema bloquea la cuenta tras 5 intentos fallidos consecutivos durante 15 minutos.

### 13.3 API keys y OAuth

Cada empresa tiene una API key para autenticar el workflow n8n contra el sistema. Se puede rotar desde el módulo Integraciones. Al rotar, el workflow debe actualizarse con la key nueva.

Los tokens OAuth de Gmail y Outlook se guardan cifrados con Fernet en la base de datos. Nunca aparecen en logs. Se pueden revocar en cualquier momento desde el propio proveedor (myaccount.google.com para Gmail, account.microsoft.com para Outlook) o desde el panel Integraciones (**Desconectar**).

### 13.4 URLs firmadas para PDFs

Los enlaces de "Ver factura" y "Ver contrato" se generan con una firma HMAC de 5 minutos. Si compartes un link, después de 5 minutos deja de funcionar. Esto evita que un link filtrado se pueda usar indefinidamente.

---

## 14. Recorrido guiado con las facturas de ejemplo

En `C:\Users\dammi\Documents\Empresas\Movaiti\Proyecto Facturación - Reestructurado\facturas` tienes 6 PDFs de facturas realistas para ensayar el flujo completo. Súbelos uno a uno o todos juntos (con la carga por lote).

Las 6 facturas:

| Archivo | Proveedor | NIT | Valor subtotal | Concepto |
|---|---|---|---|---|
| FAC-2026-101 | García & Asociados Consultores S.A.S. | 901234567-1 | 3.000.000 | Honorarios profesionales |
| FAC-2026-102 | Seguridad y Aseo Integral S.A. | 900475200-3 | 2.600.000 | Servicios de aseo y vigilancia |
| FAC-2026-103 | Comunicaciones Celulares COMCEL S.A. | 800153993-7 | 785.000 | Telefonía + internet |
| FAC-2026-104 | Papelería y Suministros del Valle Ltda. | 805012984-6 | 1.782.500 | Papelería y consumibles |
| FAC-2026-105 | Inmobiliaria Centro Cali S.A.S. | 900987654-2 | 4.200.000 | Arrendamiento local |
| FAC-2026-106 | Tecnología y Soporte Andino S.A.S. | 901555000-8 | 1.180.000 | Servicios técnicos |

### 14.1 Recorrido paso a paso (30 minutos)

**Paso 1 — Subir las 6 facturas.** Sidebar → Facturas → + Subir factura. Sube una por una. Espera a que cada procesamiento termine antes de la siguiente para no saturar la cola de Gemini.

**Paso 2 — Revisar los proveedores creados.** Sidebar → Proveedores. Deben aparecer los 6 con sus NITs. Completa los datos que la IA no detectó (ciudad, contacto, régimen tributario).

**Paso 3 — Distribuir por oficinas.** En cada factura, click **Asignar oficinas**. Ejemplos sugeridos:
- FAC-2026-101 (honorarios): 100% Administración.
- FAC-2026-102 (aseo): 60% Sede Cali, 40% Sucursal Bogotá.
- FAC-2026-105 (arrendamiento): 70% Sede Cali, 30% Sucursal Bogotá.

Necesitas haber creado las oficinas antes (ver 4.4). Si aún no lo hiciste, hazlo ahora.

**Paso 4 — Aprobar las facturas.** En cada una, click **Aprobar**. El sistema crea la causación automática. Puedes verificar el asiento generado en el detalle de la factura o en Sidebar → Asientos.

**Paso 5 — Revisar el libro mayor.** Sidebar → Libro mayor → cuenta 220505 (Proveedores nacionales). Debe mostrar los 6 abonos por el total de cada factura (subtotal + IVA - retenciones).

**Paso 6 — Registrar pagos parciales.** Marca como PAGADAS las facturas 101 (honorarios), 103 (COMCEL) y 106 (mantenimiento) usando la cuenta Bancolombia Corriente. Deja las otras 3 como APROBADAS pendientes de pago.

**Paso 7 — Balance de comprobación.** Sidebar → Balance. Verifica:
- Bancolombia (111005) tiene un débito y luego un crédito por los pagos.
- Proveedores (220505) tiene abonos por las 6 causaciones y cargos por los 3 pagos.
- Los gastos (5-xxxxx) tienen los cargos correspondientes.
- Suma total débitos = suma total créditos.

**Paso 8 — Simular conciliación bancaria.** Sidebar → Conciliación bancaria → **+ Cargar extracto**. Como no tienes un extracto real, salta este paso. Cuando lo tengas real (Bancolombia, Davivienda), el sistema detecta las 3 salidas y las concilia automáticamente por monto + fecha + referencia.

**Paso 9 — Explorar la conciliación DIAN.** Sidebar → Conciliación DIAN. Sin credenciales del portal DIAN reales, puedes ver la estructura de las 4 pestañas y probar el fixture de desarrollo con `DEBUG=True`.

**Paso 10 — Generar medios magnéticos.** Sidebar → Medios Magnéticos → año 2026 → **Generar 1001**. Descarga el CSV y ábrelo. Debe listar los 6 proveedores con sus retenciones.

Al terminar, tienes en tu instancia una foto realista de una empresa colombiana mediana operando un mes.

---

## 15. Glosario contable

**Asiento contable**. Registro de una operación económica que afecta al menos dos cuentas del PUC con débitos y créditos que suman igual.

**Causación**. Reconocer contablemente una obligación (o un derecho) en el momento en que ocurre, independiente de si se pagó o no. Cuando apruebas una factura, causas el gasto y la deuda con el proveedor.

**Centro de costo**. División interna a la que se le asignan gastos o ingresos. En Fortuna se representan como oficinas.

**CUFE** (Código Único de Factura Electrónica). Firma única que la DIAN asigna a cada factura electrónica.

**Débito y crédito**. Los dos lados de un asiento contable. Débito no es "quitar" y crédito no es "poner" — dependen del tipo de cuenta.

**Factura electrónica**. Documento tributario emitido y reportado a la DIAN en tiempo real.

**IVA descontable**. IVA que pagas al comprar y que puedes descontar del IVA que cobras al vender (si eres responsable de IVA).

**IVA generado**. IVA que cobras al vender.

**Medios magnéticos**. Nombre coloquial del régimen de información exógena de la DIAN. Reportes anuales de terceros.

**NIT**. Número de Identificación Tributaria. Identifica a personas jurídicas y naturales ante la DIAN.

**Partida doble**. Principio contable que exige que todo asiento tenga débitos igual a créditos.

**PUC**. Plan Único de Cuentas. Catálogo estándar de cuentas contables en Colombia (Decreto 2650 de 1993).

**Retefuente**. Retención en la fuente. Anticipo del impuesto de renta que el comprador retiene y paga a la DIAN por cuenta del vendedor.

**ReteICA**. Retención del impuesto de industria y comercio. Municipal.

**ReteIVA**. Retención de una parte del IVA (15%). Aplica en operaciones con grandes contribuyentes.

**Tenant**. Empresa como unidad aislada dentro del SaaS. Un usuario puede tener acceso a varios tenants.

**UVT** (Unidad de Valor Tributario). Base de cálculo de la DIAN. En 2026 vale $52.374 pesos. Las tablas de retención se expresan en UVT y se convierten a pesos con el valor vigente.

---

## 16. Preguntas frecuentes

**Subí una factura y no aparece.**
Revisa Sidebar → Facturas → filtro Estado = TODOS. Puede estar en un estado que no muestre el filtro por defecto. Si tampoco así, mira los logs del workflow en n8n (Executions) para ver si el procesamiento falló.

**La IA extrajo mal los datos de una factura.**
Es común con PDFs escaneados. Corrige los campos a mano y aprueba. La factura queda igual. Si el error se repite con muchos PDFs de un mismo proveedor, revisa si el PDF viene con capa OCR o es una imagen pura (en cuyo caso Gemini tiene menos precisión).

**Aprobé una factura por error y ya se causó.**
Anula el asiento contable (Sidebar → Asientos → el asiento → Anular). Después, cambia la factura a ANULADA. El asiento queda con estado ANULADO y no afecta reportes.

**El extracto bancario no reconoce mi banco.**
El sistema soporta Bancolombia, Davivienda y formato genérico. Si tu banco no está, contacta al operador del SaaS. Mientras tanto, exporta tu extracto a CSV con columnas Fecha, Descripción, Referencia, Débito, Crédito y súbelo — el detector genérico lo debería procesar.

**Mi empresa no cobra IVA pero el sistema me lo aplica en las facturas.**
En Impuestos, ajusta la tarifa de IVA para tu empresa. También revisa el régimen tributario del proveedor: si es "No responsable de IVA", el sistema no calcula IVA descontable en esa factura.

**Necesito rotar la API key de la empresa (sospecha de fuga).**
Sidebar → Integraciones → botón **Rotar API key**. Confirma. El sistema genera una key nueva y desactiva la vieja. Actualiza el workflow de n8n con la nueva antes de que empiecen a llegar 401.

**Me expiraron los tokens de Gmail/Outlook.**
Los refresh tokens duran 7 días en apps OAuth no verificadas y 6 meses en verificadas. Ve a Integraciones → **Reconectar Gmail/Outlook**. Re-autoriza. No pierdes datos históricos.

**¿Puedo usar el sistema sin conexión a internet?**
No. Es un SaaS. Requiere internet para todo (login, cargar facturas, ver el PUC).

**Se me cerró la sesión al volver a la pestaña después de tiempo.**
Los tokens de acceso duran 60 minutos, pero el sistema los refresca solo automáticamente en cada acción. Si se cerró la sesión, el refresh token también expiró (7 días de inactividad). Vuelve a iniciar sesión. No pierdes datos.

**¿Cómo elimino una empresa?**
Contacta al superadmin del SaaS (Movaiti). No hay botón de auto-eliminación por diseño — evita accidentes.

---

## Contacto y soporte

Para dudas operativas, escríbenos a `contactos@movaiti.com`.

Para incidencias técnicas (caídas del sistema, errores masivos), el mismo correo con asunto `[INCIDENTE]`.

Para solicitudes de eliminación de datos, rectificación o revocatoria de autorización (Ley 1581 de 2012), ver [Política de privacidad](https://app.movaiti.com/privacidad).

Última revisión de este manual: 21 de septiembre de 2026.
