import * as vscode from "vscode"
import delay from "delay"
import { ClineProvider } from "../core/webview/ClineProvider"
import { VsCodeLmService } from "../services/VsCodeLmService"

export type RegisterCommandOptions = {
	context: vscode.ExtensionContext
	outputChannel: vscode.OutputChannel
	provider: ClineProvider
}

export const registerCommands = (options: RegisterCommandOptions) => {
	const { context, outputChannel, provider } = options

	// Register existing commands
	for (const [command, callback] of Object.entries(getCommandsMap(options))) {
		context.subscriptions.push(vscode.commands.registerCommand(command, callback))
	}

	// Register VS Code LM Service
	const vsCodeLmService = new VsCodeLmService(context, outputChannel)

	// Register the definition provider
	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(
			{ scheme: "file", language: "*" },
			{
				provideDefinition(
					document: vscode.TextDocument,
					position: vscode.Position,
					token: vscode.CancellationToken,
				) {
					return vsCodeLmService.goToDefinition(document, position, token)
				},
			},
		),
	)
}

const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions) => {
	return {
		"roo-cline.plusButtonClicked": async () => {
			await provider.clearTask()
			await provider.postStateToWebview()
			await provider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		},
		"roo-cline.mcpButtonClicked": () => {
			provider.postMessageToWebview({ type: "action", action: "mcpButtonClicked" })
		},
		"roo-cline.promptsButtonClicked": () => {
			provider.postMessageToWebview({ type: "action", action: "promptsButtonClicked" })
		},
		"roo-cline.popoutButtonClicked": () => openClineInNewTab({ context, outputChannel }),
		"roo-cline.openInNewTab": () => openClineInNewTab({ context, outputChannel }),
		"roo-cline.settingsButtonClicked": () => {
			provider.postMessageToWebview({ type: "action", action: "settingsButtonClicked" })
		},
		"roo-cline.historyButtonClicked": () => {
			provider.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
		},
		"roo-cline.helpButtonClicked": () => {
			vscode.env.openExternal(vscode.Uri.parse("https://docs.roocode.com"))
		},
		"roo-cline.vslmNotImplemented": async () => {
			vscode.window.showInformationMessage(
				"VS Code Language Model integration is now available through the definition provider.",
				{ modal: true },
			)
		},
	}
}

const openClineInNewTab = async ({ context, outputChannel }: Omit<RegisterCommandOptions, "provider">) => {
	outputChannel.appendLine("Opening Roo Code in new tab")

	const tabProvider = new ClineProvider(context, outputChannel)
	const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))

	// Check if there are any visible text editors, otherwise open a new group
	// to the right.
	const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0

	if (!hasVisibleEditors) {
		await vscode.commands.executeCommand("workbench.action.newGroupRight")
	}

	const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two

	const panel = vscode.window.createWebviewPanel(ClineProvider.tabPanelId, "Roo Code", targetCol, {
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [context.extensionUri],
	})

	panel.iconPath = {
		light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "rocket.png"),
		dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "rocket.png"),
	}

	await tabProvider.resolveWebviewView(panel)

	// Lock the editor group so clicking on files doesn't open them over the panel
	await delay(100)
	await vscode.commands.executeCommand("workbench.action.lockEditorGroup")
}
