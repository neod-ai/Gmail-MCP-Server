#!/usr/bin/env python3
"""
Ejemplo de cliente Python para el servidor Gmail MCP con autenticación de usuario.
Este ejemplo muestra cómo enviar credenciales OAuth con cada solicitud.
"""

import asyncio
import json
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Ejemplo de credenciales OAuth del usuario
# IMPORTANTE: En producción, estas credenciales deben ser obtenidas de forma segura
USER_CREDENTIALS = {
    "access_token": "ya29.a0ARrdaM...", # Token de acceso OAuth
    "refresh_token": "1//0G-...", # Token de refresh OAuth  
    "scope": "https://www.googleapis.com/auth/gmail.modify",
    "token_type": "Bearer",
    "expiry_date": 1640995200000  # Timestamp de expiración
}

async def main():
    """Función principal que demuestra el uso del cliente MCP con credenciales de usuario."""
    
    # Parámetros del servidor MCP
    server_params = StdioServerParameters(
        command="node",
        args=["dist/index.js"],
        env={
            "USE_USER_CREDENTIALS": "true",  # Habilitar modo de credenciales de usuario
            "DEBUG_USER_AUTH": "true"        # Habilitar debug para desarrollo
        }
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            
            # Inicializar el cliente
            await session.initialize()
            
            print("🚀 Cliente Gmail MCP con autenticación de usuario iniciado")
            print("=" * 60)
            
            # Ejemplo 1: Listar herramientas disponibles
            print("\n📋 Listando herramientas disponibles...")
            tools = await session.list_tools()
            print(f"Herramientas encontradas: {len(tools.tools)}")
            for tool in tools.tools:
                print(f"  - {tool.name}: {tool.description}")
            
            # Ejemplo 2: Listar etiquetas de Gmail
            print("\n🏷️  Listando etiquetas de Gmail...")
            try:
                response = await session.call_tool(
                    "list_email_labels", 
                    {
                        "_userCredentials": USER_CREDENTIALS  # Credenciales incluidas en la solicitud
                    }
                )
                print("Etiquetas obtenidas exitosamente:")
                if response.content:
                    print(response.content[0].text)
            except Exception as e:
                print(f"Error al listar etiquetas: {e}")
            
            # Ejemplo 3: Buscar emails
            print("\n🔍 Buscando emails...")
            try:
                response = await session.call_tool(
                    "search_emails",
                    {
                        "query": "is:unread",
                        "maxResults": 5,
                        "_userCredentials": USER_CREDENTIALS  # Credenciales incluidas en la solicitud
                    }
                )
                print("Búsqueda de emails completada:")
                if response.content:
                    print(response.content[0].text)
            except Exception as e:
                print(f"Error al buscar emails: {e}")
            
            # Ejemplo 4: Enviar un email
            print("\n📧 Enviando email de prueba...")
            try:
                response = await session.call_tool(
                    "send_email",
                    {
                        "to": ["test@example.com"],
                        "subject": "Email de prueba desde MCP con autenticación de usuario",
                        "body": "Este email fue enviado usando el servidor Gmail MCP con autenticación stateless.",
                        "mimeType": "text/plain",
                        "_userCredentials": USER_CREDENTIALS  # Credenciales incluidas en la solicitud
                    }
                )
                print("Email enviado exitosamente:")
                if response.content:
                    print(response.content[0].text)
            except Exception as e:
                print(f"Error al enviar email: {e}")
            
            print("\n✅ Ejemplo completado")

def validate_credentials():
    """Valida que las credenciales tengan el formato correcto."""
    required_fields = ["access_token", "refresh_token", "scope", "token_type"]
    
    for field in required_fields:
        if field not in USER_CREDENTIALS or not USER_CREDENTIALS[field]:
            print(f"❌ Error: Campo requerido '{field}' falta en las credenciales")
            print("Por favor, actualiza las credenciales OAuth en el script")
            return False
    
    if USER_CREDENTIALS["access_token"] == "ya29.a0ARrdaM...":
        print("❌ Error: Debes reemplazar las credenciales de ejemplo con credenciales reales")
        print("Instrucciones:")
        print("1. Configura OAuth 2.0 en Google Cloud Console")
        print("2. Obtén tokens de acceso y refresh para el usuario")
        print("3. Reemplaza USER_CREDENTIALS en este script")
        return False
    
    return True

if __name__ == "__main__":
    print("🔐 Gmail MCP Client - Ejemplo con Autenticación de Usuario")
    print("=" * 60)
    
    if not validate_credentials():
        sys.exit(1)
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Cliente cerrado por el usuario")
    except Exception as e:
        print(f"\n❌ Error inesperado: {e}")
        sys.exit(1)
