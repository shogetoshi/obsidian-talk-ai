import { App, Editor, MarkdownView, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';

interface TalkAISettings {
	openAIApiKey: string;
}

const DEFAULT_SETTINGS: TalkAISettings = {
	openAIApiKey: '' // ここにAPIキーを設定してください
}

export default class TalkAIPlugin extends Plugin {
	settings: TalkAISettings;

	async onload() {
		await this.loadSettings();

		// リボンアイコンを追加
		const ribbonIconEl = this.addRibbonIcon('message-square', 'Talk AI', async (evt: MouseEvent) => {
			await this.askAI();
		});

		// コマンドを追加
		this.addCommand({
			id: 'ask-ai',
			name: 'AIに質問する',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.askAI();
			}
		});

		// 設定タブを追加
		this.addSettingTab(new TalkAISettingTab(this.app, this));
	}

	async askAI() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			new Notice('エディタを開いてください');
			return;
		}

		const editor = activeView.editor;

		// APIキーの確認
		if (!this.settings.openAIApiKey) {
			new Notice('設定でOpenAI APIキーを入力してください');
			return;
		}

		// 固定の質問
		const question = '10000までの素数を計算するプログラム書いて';

		// 質問をエディタに追加
		const currentCursor = editor.getCursor();
		editor.replaceRange(`\n\n**質問:** ${question}\n\n**回答:**\n`, currentCursor);

		// 回答の開始位置を取得
		const answerStartLine = currentCursor.line + 4;
		editor.setCursor({ line: answerStartLine, ch: 0 });

		try {
			new Notice('AIに問い合わせ中...');

			// OpenAI APIを使用してストリーミングで回答を取得
			await this.streamOpenAIResponse(editor, answerStartLine);

			new Notice('回答が完了しました');
		} catch (error) {
			console.error('Error calling OpenAI API:', error);
			editor.replaceRange(`\nエラーが発生しました: ${error.message}\n`, { line: answerStartLine, ch: 0 });
			new Notice('エラーが発生しました');
		}
	}

	async streamOpenAIResponse(editor: Editor, startLine: number) {
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.settings.openAIApiKey}`
			},
			body: JSON.stringify({
				model: 'gpt-4',
				messages: [
					{
						role: 'user',
						content: '10000までの素数を計算するプログラム書いて'
					}
				],
				stream: true
			})
		});

		if (!response.ok) {
			throw new Error(`API request failed: ${response.status} ${response.statusText}`);
		}

		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error('Response body is not readable');
		}

		const decoder = new TextDecoder();
		let accumulatedText = '';
		let currentLine = startLine;

		try {
			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					break;
				}

				const chunk = decoder.decode(value, { stream: true });
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (line.trim() === '') continue;
					if (line.trim() === 'data: [DONE]') continue;

					if (line.startsWith('data: ')) {
						try {
							const jsonData = JSON.parse(line.substring(6));
							const content = jsonData.choices[0]?.delta?.content;

							if (content) {
								accumulatedText += content;

								// エディタに追加
								editor.replaceRange(
									content,
									{ line: currentLine, ch: editor.getLine(currentLine).length }
								);

								// 改行が含まれている場合は行数を更新
								const newlineCount = (content.match(/\n/g) || []).length;
								currentLine += newlineCount;
							}
						} catch (e) {
							// JSONパースエラーは無視
							console.error('Failed to parse JSON:', e);
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TalkAISettingTab extends PluginSettingTab {
	plugin: TalkAIPlugin;

	constructor(app: App, plugin: TalkAIPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Talk AI 設定'});

		new Setting(containerEl)
			.setName('OpenAI APIキー')
			.setDesc('OpenAIのAPIキーを入力してください (https://platform.openai.com/api-keys で取得できます)')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.openAIApiKey)
				.onChange(async (value) => {
					this.plugin.settings.openAIApiKey = value;
					await this.plugin.saveSettings();
				}));
	}
}
