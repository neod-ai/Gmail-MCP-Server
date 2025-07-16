import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { z } from 'zod';
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

// API info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    name: 'Gmail MCP Server HTTP API',
    version: '1.2.0',
    description: 'HTTP REST API for Gmail operations with stateless user authentication',
    endpoints: [
      'POST /api/tools/send-email',
      'POST /api/tools/draft-email',
      'POST /api/tools/read-email',
      'POST /api/tools/search-emails',
      'POST /api/tools/modify-email',
      'POST /api/tools/delete-email',
      'POST /api/tools/list-labels',
      'POST /api/tools/batch-modify-emails',
      'POST /api/tools/batch-delete-emails',
      'POST /api/tools/create-label',
      'POST /api/tools/update-label',
      'POST /api/tools/delete-label',
      'POST /api/tools/get-or-create-label',
      'POST /api/tools/download-attachment'
    ],
    authentication: 'Stateless user credentials in request body',
    documentation: 'See README-USER-AUTH.md'
  });
});

// Tool execution wrapper
async function executeToolEndpoint(
  toolName: string,
  schema: z.ZodSchema,
  toolFunction: (args: any, gmail: any) => Promise<any>
) {
  return async (req: express.Request, res: express.Response) => {
    try {
      console.log(`[HTTP] ${toolName} request received`);
      
      // Validate request body
      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: validationResult.error.errors
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

      // Initialize authentication middleware
      const userCredentialsManager = new UserCredentialsManager();
      const authMiddleware = new AuthenticationMiddleware(userCredentialsManager);
      const toolHandler = new GenericToolHandler(authMiddleware);

      // Execute tool with handler using the correct method
      const result = await toolHandler.executeWithCredentials(toolFunction, args);
      
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

// Define API endpoints
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

// Start server
const port = parseInt(process.env.PORT || '8080', 10);
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Gmail MCP HTTP Server listening on port ${port}`);
  console.log(`📖 API documentation: http://localhost:${port}/api/info`);
  console.log(`💚 Health check: http://localhost:${port}/health`);
});

export { app };
