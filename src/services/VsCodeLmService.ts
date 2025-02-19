import * as vscode from "vscode"

// Types for VS Code's experimental language model tools API
interface VsCodeToolResultContent {
	type: "text"
	textContent: string
}

interface VsCodeToolResult {
	content: VsCodeToolResultContent[]
	isError?: boolean
}

interface VsCodeTool<T = any> {
	schema: {
		type: string
		properties: Record<string, any>
		required: string[]
	}
	invoke(options: ToolInvocationOptions<T>, token: vscode.CancellationToken): Promise<VsCodeToolResult>
}

interface ToolInvocationOptions<T> {
	input: T
}

// Our local types for language model tools
interface LocalLanguageModelTool<T = any> {
	description: string
	parameters: {
		type: string
		properties: Record<string, any>
		required: string[]
	}
	handler: (params?: T) => Promise<string | object | undefined>
}

export class VsCodeLmService {
	private readonly context: vscode.ExtensionContext
	private readonly outputChannel: vscode.OutputChannel
	private readonly registeredTools: Set<string> = new Set()

	constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
		this.context = context
		this.outputChannel = outputChannel
	}

	registerProviders(): void {
		// Register the definition provider
		this.context.subscriptions.push(
			vscode.languages.registerDefinitionProvider(
				{ scheme: "file", language: "typescript" },
				{
					provideDefinition: (document, position, token) => this.goToDefinition(document, position, token),
				},
			),
		)

		// Initial registration
		this.registerLanguageModelTools()
	}

	private registerTool<T>(name: string, tool: LocalLanguageModelTool<T>): vscode.Disposable | undefined {
		try {
			const outputChannel = this.outputChannel

			// Validate tool name
			if (!name || typeof name !== "string" || name.trim().length === 0) {
				throw new Error("Invalid tool name")
			}

			// Validate tool schema
			if (!tool.parameters || !tool.parameters.type) {
				throw new Error("Invalid tool schema")
			}

			const toolToRegister = {
				schema: {
					type: tool.parameters.type,
					properties: tool.parameters.properties,
					required: tool.parameters.required,
				},
				async invoke(
					options: ToolInvocationOptions<T>,
					token: vscode.CancellationToken,
				): Promise<VsCodeToolResult> {
					try {
						const result = await tool.handler(options.input)

						// Validate the result
						if (result === undefined || result === null) {
							return {
								content: [
									{
										type: "text",
										textContent: "Operation completed successfully but returned no result",
									},
								],
							}
						}

						return {
							content: [
								{
									type: "text",
									textContent: typeof result === "string" ? result : JSON.stringify(result, null, 2),
								},
							],
						}
					} catch (error: any) {
						outputChannel.appendLine(`Tool ${name} execution failed: ${error.message}`)
						return {
							content: [
								{
									type: "text",
									textContent: `Error executing tool: ${error.message}`,
								},
							],
							isError: true,
						}
					}
				},
			}

			const disposable = vscode.lm.registerTool(name, toolToRegister as VsCodeTool)
			this.registeredTools.add(name)
			this.outputChannel.appendLine(`Registered tool: ${name}`)
			return disposable
		} catch (error: any) {
			this.outputChannel.appendLine(`Failed to register tool ${name}: ${error.message}`)
			return undefined
		}
	}

	private unregisterTools(): void {
		//With the new API, there is no unregister functionality.
		this.registeredTools.clear()
	}

	private registerLanguageModelTools(): void {
		// Unregister existing tools - NOOP
		this.unregisterTools()

		this.outputChannel.appendLine("Registering language model tools...")

		// Register our tools with the language model
		const listOpenEditorsDisposable = this.registerTool("listOpenEditors", {
			description: "Lists all currently open editors in VS Code",
			parameters: {
				type: "object",
				properties: {},
				required: [],
			},
			handler: async (_params?: undefined) => {
				try {
					const editors = vscode.window.visibleTextEditors.map((editor) => ({
						fileName: editor.document.fileName,
						languageId: editor.document.languageId,
						lineCount: editor.document.lineCount,
						isUntitled: editor.document.isUntitled,
					}))

					if (editors.length === 0) {
						return "No editors are currently open"
					}

					return "Open editors:\n" + editors.map((e) => `- ${e.fileName} (${e.languageId})`).join("\n")
				} catch (error: any) {
					throw new Error(`Failed to list open editors: ${error.message}`)
				}
			},
		})

		const getConfigurationSettingDisposable = this.registerTool("getConfigurationSetting", {
			description: "Gets the value of a VS Code configuration setting",
			parameters: {
				type: "object",
				properties: {
					settingName: {
						type: "string",
						description: "The name of the setting to retrieve",
					},
				},
				required: ["settingName"],
			},
			handler: async (params?: { settingName: string }) => {
				if (!params?.settingName) {
					throw new Error("Setting name is required")
				}

				try {
					// Validate setting name format
					if (!/^[\w.-]+(?:\.[\w.-]+)*$/.test(params.settingName)) {
						throw new Error("Invalid setting name format")
					}

					const config = vscode.workspace.getConfiguration()
					const value = config.get(params.settingName)

					if (value === undefined) {
						return `Setting "${params.settingName}" is not defined`
					}

					return `Setting "${params.settingName}": ${JSON.stringify(value, null, 2)}`
				} catch (error: any) {
					throw new Error(`Failed to get configuration setting: ${error.message}`)
				}
			},
		})

		const revealFileInExplorerDisposable = this.registerTool("revealFileInExplorer", {
			description: "Reveals a file in the VS Code Explorer",
			parameters: {
				type: "object",
				properties: {
					filePath: {
						type: "string",
						description: "The path to the file to reveal",
					},
				},
				required: ["filePath"],
			},
			handler: async (params?: { filePath: string }) => {
				if (!params?.filePath) {
					throw new Error("File path is required")
				}

				try {
					// Basic path validation and normalization
					const normalizedPath = vscode.Uri.file(params.filePath).fsPath

					// Check if file exists
					try {
						await vscode.workspace.fs.stat(vscode.Uri.file(normalizedPath))
					} catch {
						throw new Error("File does not exist")
					}

					await vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(normalizedPath))
					return `Successfully revealed ${params.filePath} in Explorer`
				} catch (error: any) {
					throw new Error(`Failed to reveal file in explorer: ${error.message}`)
				}
			},
		})

		if (listOpenEditorsDisposable) this.context.subscriptions.push(listOpenEditorsDisposable)
		if (getConfigurationSettingDisposable) this.context.subscriptions.push(getConfigurationSettingDisposable)
		if (revealFileInExplorerDisposable) this.context.subscriptions.push(revealFileInExplorerDisposable)
		this.outputChannel.appendLine("Language Model tools registered.")
	}

	async goToDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
	): Promise<vscode.Definition | undefined> {
		try {
			// 1. Get the word at the current position
			const wordRange = document.getWordRangeAtPosition(position)
			if (!wordRange) {
				return undefined
			}
			const word = document.getText(wordRange)
			if (!word) {
				return undefined
			}

			this.outputChannel.appendLine(`Looking for definition of "${word}"`)

			// 2. Look for function declarations
			const text = document.getText()
			const lines = text.split("\n")

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i]

				// Check for function declarations
				const functionDecl = new RegExp(`\\bfunction\\s+${word}\\s*\\(`)
				// Check for variable declarations
				const varDecl = new RegExp(`\\b(const|let|var)\\s+${word}\\s*=`)
				// Check for class declarations
				const classDecl = new RegExp(`\\bclass\\s+${word}\\b`)
				// Check for method declarations
				const methodDecl = new RegExp(`\\b${word}\\s*\\(`)

				if (functionDecl.test(line) || varDecl.test(line) || classDecl.test(line) || methodDecl.test(line)) {
					this.outputChannel.appendLine(`Found definition at line ${i + 1}`)
					return new vscode.Location(document.uri, new vscode.Position(i, line.indexOf(word)))
				}
			}

			this.outputChannel.appendLine(`No definition found for "${word}"`)
			return undefined
		} catch (error: any) {
			this.outputChannel.appendLine(`An error occurred while finding definition: ${error.message}`)
			return undefined
		}
	}

	isToolRegistered(toolName: string): boolean {
		return vscode.lm.tools.some((tool) => tool.name === toolName)
	}
}
