# Ejemplos de Cliente - Gmail MCP Server

Este directorio contiene ejemplos de clientes que demuestran cómo usar el servidor Gmail MCP con autenticación de usuario stateless.

## 📋 Archivos Disponibles

- `python_client_example.py` - Cliente Python con MCP SDK
- `nodejs_client_example.mjs` - Cliente Node.js con MCP SDK  
- `requirements.txt` - Dependencias para el ejemplo Python
- `README.md` - Este archivo

## 🚀 Configuración Previa

### 1. Compilar el Servidor

```bash
# Desde el directorio raíz del proyecto
npm run build
```

### 2. Configurar Variables de Entorno

```bash
export USE_USER_CREDENTIALS=true
export DEBUG_USER_AUTH=true  # Opcional, para debug
```

### 3. Obtener Credenciales OAuth

Antes de ejecutar los ejemplos, necesitas:

1. **Configurar Google Cloud Console**:
   - Crear proyecto en [Google Cloud Console](https://console.cloud.google.com/)
   - Habilitar Gmail API
   - Crear credenciales OAuth 2.0
   - Configurar URIs de redirección

2. **Obtener Tokens**:
   - Implementar flujo OAuth 2.0
   - Obtener `access_token` y `refresh_token`
   - Reemplazar credenciales de ejemplo en los scripts

## 🐍 Ejemplo Python

### Instalación

```bash
cd examples
pip install -r requirements.txt
```

### Configuración

Edita `python_client_example.py` y reemplaza las credenciales:

```python
USER_CREDENTIALS = {
    "access_token": "tu_access_token_real",
    "refresh_token": "tu_refresh_token_real",
    "scope": "https://www.googleapis.com/auth/gmail.modify",
    "token_type": "Bearer",
    "expiry_date": 1640995200000
}
```

### Ejecución

```bash
python python_client_example.py
```

## 🟢 Ejemplo Node.js

### Configuración

Edita `nodejs_client_example.mjs` y reemplaza las credenciales:

```javascript
const USER_CREDENTIALS = {
    access_token: "tu_access_token_real",
    refresh_token: "tu_refresh_token_real",
    scope: "https://www.googleapis.com/auth/gmail.modify",
    token_type: "Bearer",
    expiry_date: 1640995200000
};
```

### Ejecución

```bash
node nodejs_client_example.mjs
```

## 🔧 Estructura de los Ejemplos

Ambos ejemplos demuestran:

1. **Inicialización del cliente MCP**
2. **Listado de herramientas disponibles**
3. **Listado de etiquetas Gmail**
4. **Búsqueda de emails**
5. **Creación de etiquetas**
6. **Envío de emails/borradores**

## 🔐 Formato de Credenciales

Las credenciales deben enviarse en cada solicitud:

```json
{
  "_userCredentials": {
    "access_token": "ya29.a0ARrdaM...",
    "refresh_token": "1//0G-...",
    "scope": "https://www.googleapis.com/auth/gmail.modify",
    "token_type": "Bearer",
    "expiry_date": 1640995200000
  }
}
```

## 📝 Logs de Debug

Con `DEBUG_USER_AUTH=true`, verás logs como:

```
[DEBUG] User authentication system initialized
[DEBUG] USE_USER_CREDENTIALS: true
[DEBUG] Using user credentials for authentication
[DEBUG] Tool: list_email_labels
[DEBUG] Creating OAuth client for user authentication
[DEBUG] User auth successful for tool: list_email_labels
```

## ⚠️ Notas Importantes

1. **Credenciales de Ejemplo**: Los ejemplos incluyen credenciales de placeholder que DEBES reemplazar
2. **Seguridad**: En producción, nunca hardcodees credenciales
3. **Scopes**: Asegúrate de que los tokens tengan el scope `gmail.modify`
4. **Expiración**: El servidor maneja automáticamente la renovación de tokens

## 🔍 Troubleshooting

### Error: "Debes reemplazar las credenciales de ejemplo"

- Reemplaza `USER_CREDENTIALS` con credenciales OAuth reales

### Error: "Invalid credentials format"

- Verifica que todos los campos requeridos estén presentes
- Asegúrate de que los valores no estén vacíos

### Error: "Gmail API not enabled"

- Habilita Gmail API en Google Cloud Console
- Verifica que el proyecto OAuth esté correctamente configurado

### Error: "Insufficient scope"

- Asegúrate de que el token tenga el scope `gmail.modify`
- Re-autentica si es necesario

## 🤝 Contribuir

Para agregar más ejemplos:

1. Crea un nuevo archivo en este directorio
2. Sigue la estructura de los ejemplos existentes
3. Incluye documentación clara
4. Agrega validación de credenciales
5. Envía un Pull Request
