#!/usr/bin/env node

/**
 * Ejemplo de cliente Node.js para el servidor Gmail MCP con autenticación de usuario.
 * Este ejemplo muestra cómo enviar credenciales OAuth con cada solicitud.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

// Ejemplo de credenciales OAuth del usuario
// IMPORTANTE: En producción, estas credenciales deben ser obtenidas de forma segura
const USER_CREDENTIALS = {
    access_token: "ya29.a0ARrdaM...", // Token de acceso OAuth
    refresh_token: "1//0G-...", // Token de refresh OAuth  
    scope: "https://www.googleapis.com/auth/gmail.modify",
    token_type: "Bearer",
    expiry_date: 1640995200000  // Timestamp de expiración
};

async function main() {
    console.log("🔐 Gmail MCP Client - Ejemplo con Autenticación de Usuario");
    console.log("=".repeat(60));
    
    if (!validateCredentials()) {
        process.exit(1);
    }
    
    // Crear proceso del servidor MCP
    const serverProcess = spawn("node", ["dist/index.js"], {
        env: {
            ...process.env,
            USE_USER_CREDENTIALS: "true",  // Habilitar modo de credenciales de usuario
            DEBUG_USER_AUTH: "true"        // Habilitar debug para desarrollo
        },
        stdio: ["pipe", "pipe", "inherit"]
    });
    
    // Crear transporte y cliente
    const transport = new StdioClientTransport({
        stdin: serverProcess.stdin,
        stdout: serverProcess.stdout
    });
    
    const client = new Client({
        name: "gmail-user-auth-example",
        version: "1.0.0"
    }, {
        capabilities: {}
    });
    
    try {
        // Conectar cliente
        await client.connect(transport);
        
        console.log("🚀 Cliente Gmail MCP con autenticación de usuario iniciado");
        console.log("=".repeat(60));
        
        // Ejemplo 1: Listar herramientas disponibles
        console.log("\n📋 Listando herramientas disponibles...");
        const tools = await client.request(
            { method: "tools/list" },
            {}
        );
        
        console.log(`Herramientas encontradas: ${tools.tools.length}`);
        tools.tools.forEach(tool => {
            console.log(`  - ${tool.name}: ${tool.description}`);
        });
        
        // Ejemplo 2: Listar etiquetas de Gmail
        console.log("\n🏷️  Listando etiquetas de Gmail...");
        try {
            const labelsResponse = await client.request(
                { method: "tools/call" },
                {
                    name: "list_email_labels",
                    arguments: {
                        _userCredentials: USER_CREDENTIALS  // Credenciales incluidas en la solicitud
                    }
                }
            );
            
            console.log("Etiquetas obtenidas exitosamente:");
            if (labelsResponse.content && labelsResponse.content.length > 0) {
                console.log(labelsResponse.content[0].text);
            }
        } catch (error) {
            console.log(`Error al listar etiquetas: ${error.message}`);
        }
        
        // Ejemplo 3: Buscar emails
        console.log("\n🔍 Buscando emails...");
        try {
            const searchResponse = await client.request(
                { method: "tools/call" },
                {
                    name: "search_emails",
                    arguments: {
                        query: "is:unread",
                        maxResults: 5,
                        _userCredentials: USER_CREDENTIALS  // Credenciales incluidas en la solicitud
                    }
                }
            );
            
            console.log("Búsqueda de emails completada:");
            if (searchResponse.content && searchResponse.content.length > 0) {
                console.log(searchResponse.content[0].text);
            }
        } catch (error) {
            console.log(`Error al buscar emails: ${error.message}`);
        }
        
        // Ejemplo 4: Crear una etiqueta
        console.log("\n🏷️  Creando nueva etiqueta...");
        try {
            const createLabelResponse = await client.request(
                { method: "tools/call" },
                {
                    name: "create_label",
                    arguments: {
                        name: `MCP-Test-${Date.now()}`,
                        messageListVisibility: "show",
                        labelListVisibility: "labelShow",
                        _userCredentials: USER_CREDENTIALS  // Credenciales incluidas en la solicitud
                    }
                }
            );
            
            console.log("Etiqueta creada exitosamente:");
            if (createLabelResponse.content && createLabelResponse.content.length > 0) {
                console.log(createLabelResponse.content[0].text);
            }
        } catch (error) {
            console.log(`Error al crear etiqueta: ${error.message}`);
        }
        
        // Ejemplo 5: Crear un borrador de email
        console.log("\n📧 Creando borrador de email...");
        try {
            const draftResponse = await client.request(
                { method: "tools/call" },
                {
                    name: "draft_email",
                    arguments: {
                        to: ["test@example.com"],
                        subject: "Borrador desde MCP con autenticación de usuario",
                        body: "Este borrador fue creado usando el servidor Gmail MCP con autenticación stateless.",
                        mimeType: "text/plain",
                        _userCredentials: USER_CREDENTIALS  // Credenciales incluidas en la solicitud
                    }
                }
            );
            
            console.log("Borrador creado exitosamente:");
            if (draftResponse.content && draftResponse.content.length > 0) {
                console.log(draftResponse.content[0].text);
            }
        } catch (error) {
            console.log(`Error al crear borrador: ${error.message}`);
        }
        
        console.log("\n✅ Ejemplo completado");
        
    } catch (error) {
        console.error("❌ Error del cliente:", error);
    } finally {
        // Cerrar cliente y servidor
        try {
            await client.close();
        } catch (e) {
            // Ignorar errores de cierre
        }
        
        serverProcess.kill();
        console.log("\n👋 Cliente cerrado");
    }
}

function validateCredentials() {
    const requiredFields = ["access_token", "refresh_token", "scope", "token_type"];
    
    for (const field of requiredFields) {
        if (!USER_CREDENTIALS[field]) {
            console.log(`❌ Error: Campo requerido '${field}' falta en las credenciales`);
            console.log("Por favor, actualiza las credenciales OAuth en el script");
            return false;
        }
    }
    
    if (USER_CREDENTIALS.access_token === "ya29.a0ARrdaM...") {
        console.log("❌ Error: Debes reemplazar las credenciales de ejemplo con credenciales reales");
        console.log("Instrucciones:");
        console.log("1. Configura OAuth 2.0 en Google Cloud Console");
        console.log("2. Obtén tokens de acceso y refresh para el usuario");
        console.log("3. Reemplaza USER_CREDENTIALS en este script");
        return false;
    }
    
    return true;
}

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
    console.error('❌ Error no capturado:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada no manejada:', reason);
    process.exit(1);
});

// Manejar cierre del proceso
process.on('SIGINT', () => {
    console.log('\n👋 Cliente cerrado por el usuario');
    process.exit(0);
});

// Ejecutar ejemplo
main().catch(error => {
    console.error("❌ Error inesperado:", error);
    process.exit(1);
});
