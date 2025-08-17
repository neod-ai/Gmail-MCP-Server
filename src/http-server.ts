import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { z } from 'zod';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { UserCredentialsManager } from './user-credentials-manager.js';
import { AuthenticationMiddleware } from './authentication-middleware.js';
import { GenericToolHandler } from './tool-handler.js';

// Import tool functions and schemas from index.ts
import {
  sendEmailTool,
  draftEmailTool,
  readEmailTool,
  searchEmailsTool,
  modifyEmailTool,
  deleteEmailTool,
  listEmailLabelsTool,
  batchModifyEmailsTool,
  batchDeleteEmailsTool,
  createLabelTool,
  updateLabelTool,
  deleteLabelTool,
  getOrCreateLabelTool,
  downloadAttachmentTool,
  // Import schemas
  SendEmailSchema,
  ReadEmailSchema,
  SearchEmailsSchema,
  ModifyEmailSchema,
  DeleteEmailSchema,
  ListEmailLabelsSchema,
  BatchModifyEmailsSchema,
  BatchDeleteEmailsSchema,
  CreateLabelSchema,
  UpdateLabelSchema,
  DeleteLabelSchema,
  GetOrCreateLabelSchema,
  DownloadAttachmentSchema
} from './index.js';

// Configuration paths
const CONFIG_DIR = path.join(os.homedir(), '.gmail-mcp');
const OAUTH_PATH = process.env.GMAIL_OAUTH_PATH || path.join(CONFIG_DIR, 'gcp-oauth.keys.json');

// Global OAuth2 client
let oauth2Client: OAuth2Client;
let userCredentialsManager: UserCredentialsManager;
let authMiddleware: AuthenticationMiddleware;

// Initialize OAuth2 configuration
async function initializeOAuth() {
  try {
    console.log('Initializing OAuth2 configuration...');
    
    // Check for OAuth keys in current directory first, then in config directory
    const localOAuthPath = path.join(process.cwd(), 'gcp-oauth.keys.json');
    let oauthPath = OAUTH_PATH;

    console.log(`Checking for OAuth keys at: ${localOAuthPath}`);
    if (fs.existsSync(localOAuthPath)) {
      oauthPath = localOAuthPath;
      console.log('Using local OAuth keys file');
    } else if (!fs.existsSync(OAUTH_PATH)) {
      console.error('Error: OAuth keys file not found. Please place gcp-oauth.keys.json in current directory or', CONFIG_DIR);
      process.exit(1);
    } else {
      console.log('Using OAuth keys from config directory');
    }

    console.log('Reading OAuth keys file...');
    const keysContent = JSON.parse(fs.readFileSync(oauthPath, 'utf8'));
    const keys = keysContent.installed || keysContent.web;

    if (!keys) {
      console.error('Error: Invalid OAuth keys file format. File should contain either "installed" or "web" credentials.');
      process.exit(1);
    }

    const callback = "http://localhost:8080/oauth2callback";
    console.log('Creating OAuth2 client...');

    oauth2Client = new OAuth2Client(
      keys.client_id,
      keys.client_secret,
      callback
    );

    console.log('OAuth2 client created successfully');
    
    // Initialize user authentication system
    console.log('Initializing user credentials manager...');
    userCredentialsManager = new UserCredentialsManager(
      keys.client_id,
      keys.client_secret,
      callback
    );

    console.log('Initializing authentication middleware...');
    authMiddleware = new AuthenticationMiddleware(
      userCredentialsManager,
      oauth2Client
    );

    console.log('✅ OAuth2 configuration initialized successfully');
  } catch (error) {
    console.error('Error initializing OAuth2:', error);
    process.exit(1);
  }
}

// Initialize the HTTP server setup
function createServer() {
  return new Promise<express.Application>(async (resolve, reject) => {
    try {
      // Initialize OAuth before creating the app
      await initializeOAuth();
      
      const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors({
    origin: true, // Allow all origins for now
    credentials: true
  }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Root endpoint - Server information page
  app.get('/', (req, res) => {
    const port = process.env.PORT || 8080;
    const tools = [
      'send-email', 'draft-email', 'read-email', 'search-emails', 'modify-email',
      'delete-email', 'list-labels', 'batch-modify-emails', 'batch-delete-emails',
      'create-label', 'update-label', 'delete-label', 'get-or-create-label', 'download-attachment'
    ];

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Gmail MCP Server</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #1a73e8; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
            .endpoint { margin: 10px 0; }
            .tools-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 20px 0; }
            .tool { background: #f8f9fa; padding: 8px; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h1>Gmail MCP Server</h1>
          <p><strong>Status:</strong> Running on port ${port}</p>
          
          <h2>🔗 API Endpoints</h2>
          <div class="endpoint">📊 <code>GET /tools</code> - Complete tools documentation with JSON schemas</div>
          <div class="endpoint">⚡ <code>POST /api/mcp</code> - Main MCP endpoint for tool execution</div>
          <div class="endpoint">💚 <code>GET /health</code> - Health check</div>
          <div class="endpoint">📄 <code>GET /</code> - This information page</div>
          
          <h2>🛠 Available Tools</h2>
          <div class="tools-list">
            ${tools.map(tool => `<div class="tool">${tool}</div>`).join('')}
          </div>
          
          <h2>📚 Usage Examples</h2>
          <pre><code># Get all tools with schemas
curl -X GET ${req.get('host') ? `${req.protocol}://${req.get('host')}` : 'http://localhost:' + port}/tools

# Execute a tool via MCP
curl -X POST ${req.get('host') ? `${req.protocol}://${req.get('host')}` : 'http://localhost:' + port}/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "tools/call",
    "params": {
      "name": "send-email",
      "arguments": {
        "to": ["example@gmail.com"],
        "subject": "Test",
        "body": "Hello!",
        "_userCredentials": {...}
      }
    }
  }'</code></pre>
          
          <h2>🔐 Authentication</h2>
          <p>All tools require <code>_userCredentials</code> object with OAuth tokens for Gmail API access.</p>
          
          <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666;">
            <p>Gmail MCP Server v1.2.0 - Model Context Protocol Server for Gmail</p>
          </footer>
        </body>
      </html>
    `);
  });

  // Tools documentation endpoint (Standard MCP)
  app.get('/tools', (req, res) => {
    res.json([
      {
        name: 'send-email',
        description: 'Send a new email immediately with optional attachments',
        inputSchema: {
          type: 'object',
          properties: {
            to: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of recipient email addresses'
            },
            subject: {
              type: 'string',
              description: 'Email subject line'
            },
            body: {
              type: 'string',
              description: 'Email body content (plain text or HTML)'
            },
            htmlBody: {
              type: 'string',
              description: 'HTML version of email body (optional)'
            },
            cc: {
              type: 'array',
              items: { type: 'string' },
              description: 'CC recipients (optional)'
            },
            bcc: {
              type: 'array',
              items: { type: 'string' },
              description: 'BCC recipients (optional)'
            },
            attachments: {
              type: 'array',
              items: { type: 'string' },
              description: 'File paths for attachments (optional)'
            },
            mimeType: {
              type: 'string',
              enum: ['text/plain', 'text/html', 'multipart/alternative'],
              default: 'text/plain',
              description: 'MIME type of the email'
            },
            threadId: {
              type: 'string',
              description: 'Thread ID to reply to (optional)'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              properties: {
                access_token: { type: 'string' },
                refresh_token: { type: 'string' },
                scope: { type: 'string' },
                token_type: { type: 'string' },
                expiry_date: { type: 'number' }
              },
              required: ['access_token']
            }
          },
          required: ['to', 'subject', 'body', '_userCredentials']
        }
      },
      {
        name: 'draft-email',
        description: 'Create a draft email without sending it',
        inputSchema: {
          type: 'object',
          properties: {
            to: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of recipient email addresses'
            },
            subject: {
              type: 'string',
              description: 'Email subject line'
            },
            body: {
              type: 'string',
              description: 'Email body content'
            },
            htmlBody: {
              type: 'string',
              description: 'HTML version of email body (optional)'
            },
            cc: {
              type: 'array',
              items: { type: 'string' },
              description: 'CC recipients (optional)'
            },
            bcc: {
              type: 'array',
              items: { type: 'string' },
              description: 'BCC recipients (optional)'
            },
            attachments: {
              type: 'array',
              items: { type: 'string' },
              description: 'File paths for attachments (optional)'
            },
            mimeType: {
              type: 'string',
              enum: ['text/plain', 'text/html', 'multipart/alternative'],
              default: 'text/plain',
              description: 'MIME type of the email'
            },
            threadId: {
              type: 'string',
              description: 'Thread ID to reply to (optional)'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['to', 'subject', 'body', '_userCredentials']
        }
      },
      {
        name: 'read-email',
        description: 'Read the content of a specific email by ID',
        inputSchema: {
          type: 'object',
          properties: {
            messageId: {
              type: 'string',
              description: 'Gmail message ID to read'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['messageId', '_userCredentials']
        }
      },
      {
        name: 'search-emails',
        description: 'Search emails using Gmail search syntax',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Gmail search query (e.g., "from:user@example.com has:attachment")'
            },
            maxResults: {
              type: 'number',
              default: 10,
              description: 'Maximum number of results to return'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['query', '_userCredentials']
        }
      },
      {
        name: 'modify-email',
        description: 'Add or remove labels from an email',
        inputSchema: {
          type: 'object',
          properties: {
            messageId: {
              type: 'string',
              description: 'Gmail message ID to modify'
            },
            addLabelIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Label IDs to add (optional)'
            },
            removeLabelIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Label IDs to remove (optional)'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['messageId', '_userCredentials']
        }
      },
      {
        name: 'delete-email',
        description: 'Permanently delete an email',
        inputSchema: {
          type: 'object',
          properties: {
            messageId: {
              type: 'string',
              description: 'Gmail message ID to delete'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['messageId', '_userCredentials']
        }
      },
      {
        name: 'list-labels',
        description: 'List all Gmail labels (system and user-created)',
        inputSchema: {
          type: 'object',
          properties: {
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['_userCredentials']
        }
      },
      {
        name: 'create-label',
        description: 'Create a new Gmail label',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the new label'
            },
            messageListVisibility: {
              type: 'string',
              enum: ['show', 'hide'],
              default: 'show',
              description: 'Visibility in message list'
            },
            labelListVisibility: {
              type: 'string',
              enum: ['labelShow', 'labelShowIfUnread', 'labelHide'],
              default: 'labelShow',
              description: 'Visibility in label list'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['name', '_userCredentials']
        }
      },
      {
        name: 'update-label',
        description: 'Update an existing Gmail label',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Label ID to update'
            },
            name: {
              type: 'string',
              description: 'New name for the label'
            },
            messageListVisibility: {
              type: 'string',
              enum: ['show', 'hide'],
              description: 'Visibility in message list'
            },
            labelListVisibility: {
              type: 'string',
              enum: ['labelShow', 'labelShowIfUnread', 'labelHide'],
              description: 'Visibility in label list'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['id', '_userCredentials']
        }
      },
      {
        name: 'delete-label',
        description: 'Delete a Gmail label',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Label ID to delete'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['id', '_userCredentials']
        }
      },
      {
        name: 'get-or-create-label',
        description: 'Get an existing label by name or create it if it does not exist',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the label to find or create'
            },
            messageListVisibility: {
              type: 'string',
              enum: ['show', 'hide'],
              default: 'show',
              description: 'Visibility in message list (for creation)'
            },
            labelListVisibility: {
              type: 'string',
              enum: ['labelShow', 'labelShowIfUnread', 'labelHide'],
              default: 'labelShow',
              description: 'Visibility in label list (for creation)'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['name', '_userCredentials']
        }
      },
      {
        name: 'batch-modify-emails',
        description: 'Modify labels for multiple emails efficiently in batches',
        inputSchema: {
          type: 'object',
          properties: {
            messageIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of Gmail message IDs to modify'
            },
            addLabelIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Label IDs to add to all messages (optional)'
            },
            removeLabelIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Label IDs to remove from all messages (optional)'
            },
            batchSize: {
              type: 'number',
              default: 50,
              description: 'Number of messages to process in each batch'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['messageIds', '_userCredentials']
        }
      },
      {
        name: 'batch-delete-emails',
        description: 'Delete multiple emails efficiently in batches',
        inputSchema: {
          type: 'object',
          properties: {
            messageIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of Gmail message IDs to delete'
            },
            batchSize: {
              type: 'number',
              default: 50,
              description: 'Number of messages to process in each batch'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['messageIds', '_userCredentials']
        }
      },
      {
        name: 'download-attachment',
        description: 'Download email attachments to local filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            messageId: {
              type: 'string',
              description: 'Gmail message ID containing the attachment'
            },
            attachmentId: {
              type: 'string',
              description: 'Attachment ID (from email metadata)'
            },
            filename: {
              type: 'string',
              description: 'Custom filename to save as (optional)'
            },
            savePath: {
              type: 'string',
              description: 'Directory path to save the attachment (optional, defaults to current directory)'
            },
            _userCredentials: {
              type: 'object',
              description: 'User OAuth credentials for Gmail API',
              required: ['access_token']
            }
          },
          required: ['messageId', 'attachmentId', '_userCredentials']
        }
      }
    ]);
  });

  // Main MCP endpoint (Standard)
  app.post('/api/mcp', async (req, res) => {
    try {
      const { method, params } = req.body;

      if (method === 'tools/list') {
        // Return list of available tools
        const tools = [
          'send-email', 'draft-email', 'read-email', 'search-emails', 'modify-email',
          'delete-email', 'list-labels', 'batch-modify-emails', 'batch-delete-emails',
          'create-label', 'update-label', 'delete-label', 'get-or-create-label', 'download-attachment'
        ];
        
        return res.json({
          tools: tools.map(name => ({
            name,
            description: `Gmail ${name.replace('-', ' ')} operation`
          }))
        });
      }

      if (method === 'tools/call') {
        const { name, arguments: args } = params;
        
        // Map tool names to functions and schemas
        const toolMapping: { [key: string]: { schema: any, func: any } } = {
          'send-email': { schema: SendEmailSchema, func: sendEmailTool },
          'draft-email': { schema: SendEmailSchema, func: draftEmailTool },
          'read-email': { schema: ReadEmailSchema, func: readEmailTool },
          'search-emails': { schema: SearchEmailsSchema, func: searchEmailsTool },
          'modify-email': { schema: ModifyEmailSchema, func: modifyEmailTool },
          'delete-email': { schema: DeleteEmailSchema, func: deleteEmailTool },
          'list-labels': { schema: ListEmailLabelsSchema, func: listEmailLabelsTool },
          'batch-modify-emails': { schema: BatchModifyEmailsSchema, func: batchModifyEmailsTool },
          'batch-delete-emails': { schema: BatchDeleteEmailsSchema, func: batchDeleteEmailsTool },
          'create-label': { schema: CreateLabelSchema, func: createLabelTool },
          'update-label': { schema: UpdateLabelSchema, func: updateLabelTool },
          'delete-label': { schema: DeleteLabelSchema, func: deleteLabelTool },
          'get-or-create-label': { schema: GetOrCreateLabelSchema, func: getOrCreateLabelTool },
          'download-attachment': { schema: DownloadAttachmentSchema, func: downloadAttachmentTool }
        };

        const tool = toolMapping[name];
        if (!tool) {
          return res.status(400).json({
            error: 'Unknown tool',
            message: `Tool '${name}' not found`
          });
        }

        // Validate arguments
        const validationResult = tool.schema.safeParse(args);
        if (!validationResult.success) {
          return res.status(400).json({
            error: 'Validation failed',
            message: 'Invalid arguments',
            details: validationResult.error.errors
          });
        }

        // Check for user credentials
        if (!args._userCredentials) {
          return res.status(400).json({
            error: 'Authentication required',
            message: 'Missing _userCredentials in arguments'
          });
        }

        // Create a mock request for authentication middleware
        const mockRequest = {
          method: 'POST',
          params: { name, arguments: args }
        };

        // Execute tool with authentication
        const handler = new GenericToolHandler(tool.func);
        const result = await authMiddleware.executeWithUserAuth(mockRequest, handler);
        
        return res.json({
          success: true,
          result
        });
      }

      // Unknown method
      return res.status(400).json({
        error: 'Unknown method',
        message: `Method '${method}' not supported`
      });

    } catch (error: any) {
      console.error('[MCP] Error:', error);
      
      if (error.message?.includes('credentials')) {
        return res.status(401).json({
          error: 'Authentication failed',
          message: error.message
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
        message: error.message || 'Unknown error occurred'
      });
    }
  });

  // Legacy API info endpoint (kept for backward compatibility)
  app.get('/api/info', (req, res) => {
    res.json({
      name: 'Gmail MCP Server HTTP API',
      version: '1.2.0',
      description: 'HTTP REST API for Gmail operations with stateless user authentication',
      notice: 'This endpoint is deprecated. Use GET /tools for complete documentation or GET / for server info',
      standardEndpoints: {
        tools: 'GET /tools - Complete tools documentation with JSON schemas',
        mcp: 'POST /api/mcp - Main MCP endpoint for tool execution',
        info: 'GET / - Server information page'
      },
      authRequired: true,
      documentation: 'All tools require _userCredentials in the arguments for authentication'
    });
  });

  // Tool execution wrapper
  function executeToolEndpoint(
    toolName: string,
    schema: z.ZodSchema,
    toolFunction: (args: any, gmail: any) => Promise<any>
  ) {
    return async (req: express.Request, res: express.Response) => {
      try {
        console.log(`[HTTP] ${toolName} request received`);

        // Validate request body against schema
        const validationResult = schema.safeParse(req.body);
        
        if (!validationResult.success) {
          console.error(`[HTTP] Validation error for ${toolName}:`, validationResult.error.errors);
          return res.status(400).json({
            error: 'Validation failed',
            message: 'Invalid request parameters',
            details: validationResult.error.errors.map(err => ({
              path: err.path.join('.'),
              message: err.message
            }))
          });
        }

        const args = validationResult.data;

        // Check if user credentials are provided
        if (!args._userCredentials) {
          return res.status(400).json({
            error: 'User credentials are required',
            message: 'Please provide _userCredentials in the request body'
          });
        }

        // Create a mock request object for the authentication middleware
        const mockRequest = {
          method: 'POST',
          params: {
            name: toolName,
            arguments: args
          }
        };

        // Create a handler that wraps the tool function
        const handler = new GenericToolHandler(toolFunction);

        // Execute tool with authentication middleware
        const result = await authMiddleware.executeWithUserAuth(mockRequest, handler);
        
        res.json({
          success: true,
          result: result
        });

      } catch (error: any) {
        console.error(`[HTTP] Error in ${toolName}:`, error);
        
        // Handle specific error types
        if (error.message?.includes('credentials')) {
          return res.status(401).json({
            error: 'Authentication failed',
            message: error.message
          });
        }
        
        if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
          return res.status(404).json({
            error: 'Resource not found',
            message: error.message
          });
        }

        res.status(500).json({
          error: 'Internal server error',
          message: error.message || 'Unknown error occurred'
        });
      }
    };
  }

  // Legacy API endpoints (kept for backward compatibility)
  // Note: These endpoints are deprecated. Use POST /api/mcp for standard MCP calls
  app.post('/api/tools/send-email', executeToolEndpoint(
    'send-email',
    SendEmailSchema,
    sendEmailTool
  ));

  app.post('/api/tools/draft-email', executeToolEndpoint(
    'draft-email',
    SendEmailSchema,
    draftEmailTool
  ));

  app.post('/api/tools/read-email', executeToolEndpoint(
    'read-email',
    ReadEmailSchema,
    readEmailTool
  ));

  app.post('/api/tools/search-emails', executeToolEndpoint(
    'search-emails',
    SearchEmailsSchema,
    searchEmailsTool
  ));

  app.post('/api/tools/modify-email', executeToolEndpoint(
    'modify-email',
    ModifyEmailSchema,
    modifyEmailTool
  ));

  app.post('/api/tools/delete-email', executeToolEndpoint(
    'delete-email',
    DeleteEmailSchema,
    deleteEmailTool
  ));

  app.post('/api/tools/list-labels', executeToolEndpoint(
    'list-labels',
    ListEmailLabelsSchema,
    listEmailLabelsTool
  ));

  app.post('/api/tools/batch-modify-emails', executeToolEndpoint(
    'batch-modify-emails',
    BatchModifyEmailsSchema,
    batchModifyEmailsTool
  ));

  app.post('/api/tools/batch-delete-emails', executeToolEndpoint(
    'batch-delete-emails',
    BatchDeleteEmailsSchema,
    batchDeleteEmailsTool
  ));

  app.post('/api/tools/create-label', executeToolEndpoint(
    'create-label',
    CreateLabelSchema,
    createLabelTool
  ));

  app.post('/api/tools/update-label', executeToolEndpoint(
    'update-label',
    UpdateLabelSchema,
    updateLabelTool
  ));

  app.post('/api/tools/delete-label', executeToolEndpoint(
    'delete-label',
    DeleteLabelSchema,
    deleteLabelTool
  ));

  app.post('/api/tools/get-or-create-label', executeToolEndpoint(
    'get-or-create-label',
    GetOrCreateLabelSchema,
    getOrCreateLabelTool
  ));

  app.post('/api/tools/download-attachment', executeToolEndpoint(
    'download-attachment',
    DownloadAttachmentSchema,
    downloadAttachmentTool
  ));

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[HTTP] Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred'
    });
  });

  // 404 handler
  app.use((req: express.Request, res: express.Response) => {
    res.status(404).json({
      error: 'Not found',
      message: 'The requested endpoint does not exist'
    });
  });

      resolve(app);
    } catch (error) {
      reject(error);
    }
  });
}

// Start server
function startServer() {
  const port = parseInt(process.env.PORT || '8080', 10);
  console.log(`Starting Gmail MCP HTTP Server on port ${port}...`);
  
  createServer().then((app: express.Application) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Gmail MCP HTTP Server listening on port ${port}`);
      console.log(`📖 API documentation: http://localhost:${port}/api/info`);
      console.log(`💚 Health check: http://localhost:${port}/health`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  }).catch((error: Error) => {
    console.error('Failed to start HTTP server:', error);
    process.exit(1);
  });
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}` || process.env.NODE_ENV === 'production') {
  startServer();
}

export { createServer };
