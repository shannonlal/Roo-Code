import * as vscode from "vscode"
import { registerCommands } from "../registerCommands"
import { ClineProvider } from "../../core/webview/ClineProvider"

/**
 * Test Plan for VSLM Not Implemented Message
 *
 * Scope: Minimal testing of command registration and message display
 * Focus: VS Code command system integration
 *
 * Phase 1 (Current - Skipped):
 * - Basic command registration verification
 * - Message content and display test
 *
 * Note: Tests are currently skipped to avoid making broad infrastructure changes.
 * They will be enabled once the VS Code command system mocking is properly set up.
 */

describe("registerCommands", () => {
	let mockContext: vscode.ExtensionContext
	let mockOutputChannel: vscode.OutputChannel
	let mockProvider: ClineProvider

	beforeEach(() => {
		mockContext = {
			subscriptions: [],
		} as any
		mockOutputChannel = {
			appendLine: jest.fn(),
		} as any
		mockProvider = {} as any
	})

	it.skip("should register the vslmNotImplemented command", () => {
		registerCommands({ context: mockContext, outputChannel: mockOutputChannel, provider: mockProvider })

		expect(mockContext.subscriptions.length).toBeGreaterThan(0)

		const vslmCommand = mockContext.subscriptions.find(
			(subscription: any) => subscription.command === "roo-cline.vslmNotImplemented",
		)
		expect(vslmCommand).toBeDefined()
	})

	it.skip("should display the VSLM not implemented message", async () => {
		const showInformationMessageMock = vscode.window.showInformationMessage as jest.Mock
		showInformationMessageMock.mockResolvedValue(undefined)

		registerCommands({ context: mockContext, outputChannel: mockOutputChannel, provider: mockProvider })

		await vscode.commands.executeCommand("roo-cline.vslmNotImplemented")

		expect(showInformationMessageMock).toHaveBeenCalledWith(
			"VS Code Language Model integration is not yet fully functional in the Cline UI. Please use the `call_vscode_lm_tool` command in the CLI to access this functionality. All code coverage must happen through the CLI interface.",
			{ modal: true },
		)
	})
})
