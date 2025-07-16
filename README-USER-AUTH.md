# Autenticación de Usuario - Gmail MCP Server

Este documento describe cómo usar el sistema de autenticación stateless basado en credenciales de usuario del servidor Gmail MCP.

## 🎯 Descripción General

El servidor Gmail MCP ahora soporta dos modos de autenticación:

1. **Autenticación del Servidor** (tradicional): El servidor usa sus propias credenciales OAuth almacenadas
2. **Autenticación de Usuario** (nuevo): Cada cliente envía sus propias credenciales OAuth con cada solicitud

### Ventajas de la Autenticación de Usuario

- ✅ **Stateless**: No almacena credenciales en memoria, base de datos o archivos
- ✅ **Escalable**: Compatible con Google Cloud Run y otros entornos serverless
- ✅ **Seguro**: Cada solicitud es independiente y usa credenciales frescas
- ✅ **Multi-usuario**: Cada cliente puede usar sus propias credenciales
- ✅ **Flexible**: Fallback automático a autenticación del servidor

## 🔧 Configuración

### Variables de Entorno

```bash
# Habilitar modo de autenticación de usuario
USE_USER_CREDENTIALS=true

# Habilitar debug para desarrollo (opcional)
DEBUG_USER_AUTH=true
```

### Configuración OAuth 2.0

Para usar autenticación de usuario, necesitas:

1. **Google Cloud Console**:
   - Crear un proyecto en [Google Cloud Console](https://console.cloud.google.com/)
   - Habilitar Gmail API
   - Crear credenciales OAuth 2.0
   - Configurar URIs de redirección autorizadas

2. **Scopes Requeridos**:
   ```
   https://www.googleapis.com/auth/gmail.modify
   ```

3. **Flujo OAuth**:
   - Los clientes deben implementar el flujo OAuth 2.0
   - Obtener `access_token` y `refresh_token`
   - Enviar credenciales con cada solicitud

## 📋 Formato de Credenciales

Las credenciales deben enviarse en el campo `_userCredentials` de cada solicitud:

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

### Campos Requeridos

- `access_token`: Token de acceso OAuth 2.0
- `refresh_token`: Token de refresh para renovar access_token
- `scope`: Alcance de permisos concedidos
- `token_type`: Tipo de token (normalmente "Bearer")
- `expiry_date`: Timestamp de expiración del access_token

## 🚀 Ejemplos de Uso

### Python Client

```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

USER_CREDENTIALS = {
    "access_token": "ya29.a0ARrdaM...",
    "refresh_token": "1//0G-...",
    "scope": "https://www.googleapis.com/auth/gmail.modify",
    "token_type": "Bearer",
    "expiry_date": 1640995200000
}

async def main():
    server_params = StdioServerParameters(
        command="node",
        args=["dist/index.js"],
        env={"USE_USER_CREDENTIALS": "true"}
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # Listar etiquetas con credenciales de usuario
            response = await session.call_tool(
                "list_email_labels", 
                {"_userCredentials": USER_CREDENTIALS}
            )
            print(response.content[0].text)

asyncio.run(main())
```

### Node.js Client

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const USER_CREDENTIALS = {
    access_token: "ya29.a0ARrdaM...",
    refresh_token: "1//0G-...",
    scope: "https://www.googleapis.com/auth/gmail.modify",
    token_type: "Bearer",
    expiry_date: 1640995200000
};

async function main() {
    const client = new Client({
        name: "gmail-client",
        version: "1.0.0"
    }, { capabilities: {} });
    
    // ... configurar transporte ...
    
    const response = await client.request(
        { method: "tools/call" },
        {
            name: "send_email",
            arguments: {
                to: ["user@example.com"],
                subject: "Hello from MCP",
                body: "Test email",
                _userCredentials: USER_CREDENTIALS
            }
        }
    );
}
```

## 🛠️ Todas las Herramientas Soportadas

Todas las herramientas del servidor soportan autenticación de usuario:

- `send_email` - Enviar emails
- `draft_email` - Crear borradores
- `read_email` - Leer emails
- `search_emails` - Buscar emails
- `modify_email` - Modificar etiquetas de emails
- `delete_email` - Eliminar emails
- `list_email_labels` - Listar etiquetas
- `create_label` - Crear etiquetas
- `update_label` - Actualizar etiquetas
- `delete_label` - Eliminar etiquetas
- `get_or_create_label` - Obtener o crear etiquetas
- `batch_modify_emails` - Modificar emails en lotes
- `batch_delete_emails` - Eliminar emails en lotes
- `download_attachment` - Descargar adjuntos

## 🔄 Manejo de Tokens

### Renovación Automática

El servidor maneja automáticamente la renovación de tokens:

1. Si el `access_token` ha expirado, usa el `refresh_token`
2. Obtiene un nuevo `access_token`
3. Continúa con la operación

### Gestión de Errores

Si las credenciales son inválidas:
- Se retorna un error descriptivo
- No se almacena ningún estado de error
- Cada solicitud es independiente

## 🐳 Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY . .
RUN npm install && npm run build

ENV USE_USER_CREDENTIALS=true
ENV DEBUG_USER_AUTH=false

CMD ["node", "dist/index.js"]
```

### Google Cloud Run

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: gmail-mcp-server
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "10"
    spec:
      containerConcurrency: 1000
      containers:
      - image: gcr.io/project/gmail-mcp-server
        env:
        - name: USE_USER_CREDENTIALS
          value: "true"
        resources:
          limits:
            cpu: "1"
            memory: "512Mi"
```

## 🔧 Configuración Avanzada

### Campos Opcionales

Además de `_userCredentials`, también puedes usar:

```json
{
  "userCredentials": { /* credenciales */ },
  "_userContext": {
    "userId": "user-123",
    "email": "user@example.com"
  }
}
```

### Modo Híbrido

El servidor detecta automáticamente qué tipo de autenticación usar:

1. Si `_userCredentials` está presente → Autenticación de usuario
2. Si no → Fallback a autenticación del servidor

## 🚨 Consideraciones de Seguridad

### Protección de Credenciales

- ❌ **NO** hardcodees credenciales en el código
- ✅ Usa variables de entorno o servicios seguros de gestión de secretos
- ✅ Implementa rotación de tokens
- ✅ Usa HTTPS en todas las comunicaciones

### Validación

El servidor valida automáticamente:
- Formato de credenciales
- Expiración de tokens
- Scopes de permisos
- Integridad de datos

### Logs y Debug

Cuando `DEBUG_USER_AUTH=true`:
- Se registran eventos de autenticación
- **NO** se registran credenciales sensibles
- Útil para desarrollo y debugging

## 📚 Troubleshooting

### Errores Comunes

1. **"Invalid credentials format"**
   - Verifica que `_userCredentials` tenga todos los campos requeridos

2. **"Token expired"**
   - El `access_token` ha expirado y el `refresh_token` es inválido
   - Re-autentica al usuario

3. **"Insufficient scope"**
   - El token no tiene permisos para Gmail API
   - Re-autentica con el scope correcto

4. **"User credentials not found"**
   - El campo `_userCredentials` no está presente
   - O `USE_USER_CREDENTIALS=false`

### Debug

Habilitar debug completo:

```bash
export USE_USER_CREDENTIALS=true
export DEBUG_USER_AUTH=true
node dist/index.js
```

## 📖 Referencias

- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Gmail API](https://developers.google.com/gmail/api)
- [MCP Specification](https://modelcontextprotocol.io)
- [Google Cloud Console](https://console.cloud.google.com/)

## 🤝 Contribuir

Para contribuir al desarrollo:

1. Fork el repositorio
2. Crea una rama para tu feature
3. Implementa los cambios
4. Agrega tests
5. Envía un Pull Request

## 📞 Soporte

Para soporte técnico:
- Abre un issue en GitHub
- Revisa la documentación existente
- Verifica los logs de debug
