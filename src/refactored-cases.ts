
// Este archivo contiene los casos refactorizados para el switch del CallToolRequestSchema
// Se usará para reemplazar el código existente

// Los casos ya refactorizados (send_email, draft_email, read_email) no se incluyen aquí

export const refactoredCases = `
                case "search_emails": {
                    return await executeWithHandler(request, async (args, gmail) => {
                        const validatedArgs = SearchEmailsSchema.parse(args);
                        const response = await gmail.users.messages.list({
                            userId: 'me',
                            q: validatedArgs.query,
                            maxResults: validatedArgs.maxResults || 10,
                        });

                        const messages = response.data.messages || [];
                        const results = await Promise.all(
                            messages.map(async (msg: any) => {
                                const detail = await gmail.users.messages.get({
                                    userId: 'me',
                                    id: msg.id!,
                                    format: 'metadata',
                                    metadataHeaders: ['Subject', 'From', 'Date'],
                                });
                                const headers = detail.data.payload?.headers || [];
                                return {
                                    id: msg.id,
                                    subject: headers.find((h: any) => h.name === 'Subject')?.value || '',
                                    from: headers.find((h: any) => h.name === 'From')?.value || '',
                                    date: headers.find((h: any) => h.name === 'Date')?.value || '',
                                };
                            })
                        );

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: results.map((r: any) =>
                                        \`ID: \${r.id}\\nSubject: \${r.subject}\\nFrom: \${r.from}\\nDate: \${r.date}\\n\`
                                    ).join('\\n'),
                                },
                            ],
                        };
                    });
                }

                // Updated implementation for the modify_email handler
                case "modify_email": {
                    return await executeWithHandler(request, async (args, gmail) => {
                        const validatedArgs = ModifyEmailSchema.parse(args);
                        
                        // Prepare request body
                        const requestBody: any = {};
                        
                        if (validatedArgs.labelIds) {
                            requestBody.addLabelIds = validatedArgs.labelIds;
                        }
                        
                        if (validatedArgs.addLabelIds) {
                            requestBody.addLabelIds = validatedArgs.addLabelIds;
                        }
                        
                        if (validatedArgs.removeLabelIds) {
                            requestBody.removeLabelIds = validatedArgs.removeLabelIds;
                        }
                        
                        await gmail.users.messages.modify({
                            userId: 'me',
                            id: validatedArgs.messageId,
                            requestBody: requestBody,
                        });

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: \`Email \${validatedArgs.messageId} labels updated successfully\`,
                                },
                            ],
                        };
                    });
                }

                case "delete_email": {
                    return await executeWithHandler(request, async (args, gmail) => {
                        const validatedArgs = DeleteEmailSchema.parse(args);
                        await gmail.users.messages.delete({
                            userId: 'me',
                            id: validatedArgs.messageId,
                        });

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: \`Email \${validatedArgs.messageId} deleted successfully\`,
                                },
                            ],
                        };
                    });
                }

                case "list_email_labels": {
                    return await executeWithHandler(request, async (args, gmail) => {
                        const labelResults = await listLabels(gmail);
                        const systemLabels = labelResults.system;
                        const userLabels = labelResults.user;

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: \`Found \${labelResults.count.total} labels (\${labelResults.count.system} system, \${labelResults.count.user} user):\\n\\n\` +
                                        "System Labels:\\n" +
                                        systemLabels.map((l: GmailLabel) => \`ID: \${l.id}\\nName: \${l.name}\\n\`).join('\\n') +
                                        "\\nUser Labels:\\n" +
                                        userLabels.map((l: GmailLabel) => \`ID: \${l.id}\\nName: \${l.name}\\n\`).join('\\n')
                                },
                            ],
                        };
                    });
                }

                case "batch_modify_emails": {
                    return await executeWithHandler(request, async (args, gmail) => {
                        const validatedArgs = BatchModifyEmailsSchema.parse(args);
                        const messageIds = validatedArgs.messageIds;
                        const batchSize = validatedArgs.batchSize || 50;
                        
                        // Prepare request body
                        const requestBody: any = {};
                        
                        if (validatedArgs.addLabelIds) {
                            requestBody.addLabelIds = validatedArgs.addLabelIds;
                        }
                        
                        if (validatedArgs.removeLabelIds) {
                            requestBody.removeLabelIds = validatedArgs.removeLabelIds;
                        }

                        // Process messages in batches
                        const { successes, failures } = await processBatches(
                            messageIds,
                            batchSize,
                            async (batch) => {
                                const results = await Promise.all(
                                    batch.map(async (messageId) => {
                                        const result = await gmail.users.messages.modify({
                                            userId: 'me',
                                            id: messageId,
                                            requestBody: requestBody,
                                        });
                                        return { messageId, success: true };
                                    })
                                );
                                return results;
                            }
                        );

                        // Generate summary of the operation
                        const successCount = successes.length;
                        const failureCount = failures.length;
                        
                        let resultText = \`Batch label modification complete.\\n\`;
                        resultText += \`Successfully processed: \${successCount} messages\\n\`;
                        
                        if (failureCount > 0) {
                            resultText += \`Failed to process: \${failureCount} messages\\n\\n\`;
                            resultText += \`Failed message IDs:\\n\`;
                            resultText += failures.map(f => \`- \${(f.item as string).substring(0, 16)}... (\${f.error.message})\`).join('\\n');
                        }

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: resultText,
                                },
                            ],
                        };
                    });
                }

                case "batch_delete_emails": {
                    return await executeWithHandler(request, async (args, gmail) => {
                        const validatedArgs = BatchDeleteEmailsSchema.parse(args);
                        const messageIds = validatedArgs.messageIds;
                        const batchSize = validatedArgs.batchSize || 50;

                        // Process messages in batches
                        const { successes, failures } = await processBatches(
                            messageIds,
                            batchSize,
                            async (batch) => {
                                const results = await Promise.all(
                                    batch.map(async (messageId) => {
                                        await gmail.users.messages.delete({
                                            userId: 'me',
                                            id: messageId,
                                        });
                                        return { messageId, success: true };
                                    })
                                );
                                return results;
                            }
                        );

                        // Generate summary of the operation
                        const successCount = successes.length;
                        const failureCount = failures.length;
                        
                        let resultText = \`Batch delete operation complete.\\n\`;
                        resultText += \`Successfully deleted: \${successCount} messages\\n\`;
                        
                        if (failureCount > 0) {
                            resultText += \`Failed to delete: \${failureCount} messages\\n\\n\`;
                            resultText += \`Failed message IDs:\\n\`;
                            resultText += failures.map(f => \`- \${(f.item as string).substring(0, 16)}... (\${f.error.message})\`).join('\\n');
                        }

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: resultText,
                                },
                            ],
                        };
                    });
                }

                // New label management handlers
                case "create_label": {
                    return await executeWithHandler(request, async (args, gmail) => {
                        const validatedArgs = CreateLabelSchema.parse(args);
                        const result = await createLabel(gmail, validatedArgs.name, {
                            messageListVisibility: validatedArgs.messageListVisibility,
                            labelListVisibility: validatedArgs.labelListVisibility,
                        });

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: \`Label created successfully:\\nID: \${result.id}\\nName: \${result.name}\\nType: \${result.type}\`,
                                },
                            ],
                        };
                    });
                }

                case "update_label": {
                    return await executeWithHandler(request, async (args, gmail) => {
                        const validatedArgs = UpdateLabelSchema.parse(args);
                        
                        // Prepare request body with only the fields that were provided
                        const updates: any = {};
                        if (validatedArgs.name) updates.name = validatedArgs.name;
                        if (validatedArgs.messageListVisibility) updates.messageListVisibility = validatedArgs.messageListVisibility;
                        if (validatedArgs.labelListVisibility) updates.labelListVisibility = validatedArgs.labelListVisibility;
                        
                        const result = await updateLabel(gmail, validatedArgs.id, updates);

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: \`Label updated successfully:\\nID: \${result.id}\\nName: \${result.name}\\nType: \${result.type}\`,
                                },
                            ],
                        };
                    });
                }

                case "delete_label": {
                    return await executeWithHandler(request, async (args, gmail) => {
                        const validatedArgs = DeleteLabelSchema.parse(args);
                        const result = await deleteLabel(gmail, validatedArgs.id);

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: result.message,
                                },
                            ],
                        };
                    });
                }

                case "get_or_create_label": {
                    return await executeWithHandler(request, async (args, gmail) => {
                        const validatedArgs = GetOrCreateLabelSchema.parse(args);
                        const result = await getOrCreateLabel(gmail, validatedArgs.name, {
                            messageListVisibility: validatedArgs.messageListVisibility,
                            labelListVisibility: validatedArgs.labelListVisibility,
                        });

                        const action = result.type === 'user' && result.name === validatedArgs.name ? 'found existing' : 'created new';
                        
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: \`Successfully \${action} label:\\nID: \${result.id}\\nName: \${result.name}\\nType: \${result.type}\`,
                                },
                            ],
                        };
                    });
                }

                case "download_attachment": {
                    return await executeWithHandler(request, async (args, gmail) => {
                        const validatedArgs = DownloadAttachmentSchema.parse(args);
                        
                        try {
                            // Get the attachment data from Gmail API
                            const attachmentResponse = await gmail.users.messages.attachments.get({
                                userId: 'me',
                                messageId: validatedArgs.messageId,
                                id: validatedArgs.attachmentId,
                            });

                            if (!attachmentResponse.data.data) {
                                throw new Error('No attachment data received');
                            }

                            // Decode the base64 data
                            const data = attachmentResponse.data.data;
                            const buffer = Buffer.from(data, 'base64url');

                            // Determine save path and filename
                            const savePath = validatedArgs.savePath || process.cwd();
                            let filename = validatedArgs.filename;
                            
                            if (!filename) {
                                // Get original filename from message if not provided
                                const messageResponse = await gmail.users.messages.get({
                                    userId: 'me',
                                    id: validatedArgs.messageId,
                                    format: 'full',
                                });
                                
                                // Find the attachment part to get original filename
                                const findAttachment = (part: any): string | null => {
                                    if (part.body && part.body.attachmentId === validatedArgs.attachmentId) {
                                        return part.filename || \`attachment-\${validatedArgs.attachmentId}\`;
                                    }
                                    if (part.parts) {
                                        for (const subpart of part.parts) {
                                            const found = findAttachment(subpart);
                                            if (found) return found;
                                        }
                                    }
                                    return null;
                                };
                                
                                filename = findAttachment(messageResponse.data.payload) || \`attachment-\${validatedArgs.attachmentId}\`;
                            }

                            // Ensure save directory exists
                            if (!fs.existsSync(savePath)) {
                                fs.mkdirSync(savePath, { recursive: true });
                            }

                            // Write file
                            const fullPath = path.join(savePath, filename);
                            fs.writeFileSync(fullPath, buffer);

                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: \`Attachment downloaded successfully:\\nFile: \${filename}\\nSize: \${buffer.length} bytes\\nSaved to: \${fullPath}\`,
                                    },
                                ],
                            };
                        } catch (error: any) {
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: \`Failed to download attachment: \${error.message}\`,
                                    },
                                ],
                            };
                        }
                    });
                }`;
