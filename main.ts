import { App, Editor, MarkdownView, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';

interface TalkAISettings {
	openAIApiKey: string;
	aiModel: string;
	systemPrompt: string;
}

const DEFAULT_SETTINGS: TalkAISettings = {
	openAIApiKey: '', // ここにAPIキーを設定してください
	aiModel: 'gpt-5.2', // デフォルトは gpt-5.2
	systemPrompt: '' // デフォルトは空
}

// モデルオプションの型定義
type ModelOptions = Record<string, string>;

interface ConversationMessage {
	role: 'user' | 'assistant';
	content: string;
}

export default class TalkAIPlugin extends Plugin {
	settings: TalkAISettings;
	modelOptions: ModelOptions = {};

	async onload() {
		await this.loadSettings();
		await this.loadModelOptions();

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

		// 直前の会話を削除するコマンド
		this.addCommand({
			id: 'delete-last-conversation',
			name: '直前の会話を削除',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.deleteLastConversation();
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

		// エディタの内容を解析して会話履歴と新しい質問を抽出
		const content = editor.getValue();
		const { history, newQuestion } = this.parseConversation(content);

		// 新しい質問が空の場合はエラー
		if (!newQuestion || newQuestion.trim() === '') {
			new Notice('質問を入力してください');
			return;
		}

		// エディタの内容を新しいフォーマットで書き換え
		let formattedContent = '';

		// 会話履歴が存在する場合は、履歴を保持
		if (history.length > 0) {
			// 既存の会話履歴をフォーマットして保持
			for (let i = 0; i < history.length; i++) {
				const msg = history[i];
				if (msg.role === 'user') {
					formattedContent += `# Q\n${msg.content}\n\n---\n\n`;
				} else {
					formattedContent += `# A\n${msg.content}\n\n---\n\n`;
				}
			}
			// 新しい質問を追加
			formattedContent += `# Q\n${newQuestion}\n\n---\n\n# A\n`;
		} else {
			// 会話履歴がない場合は新規フォーマット
			formattedContent = `# Q\n${newQuestion}\n\n---\n\n# A\n`;
		}

		editor.setValue(formattedContent);

		// 回答の開始位置を取得 (最終行)
		const lastLine = editor.lastLine();
		const answerStartLine = lastLine;
		editor.setCursor({ line: answerStartLine, ch: editor.getLine(answerStartLine).length });

		try {
			new Notice('AIに問い合わせ中...');

			// OpenAI APIを使用してストリーミングで回答を取得
			await this.streamOpenAIResponse(editor, answerStartLine, history, newQuestion);

			new Notice('回答が完了しました');
		} catch (error) {
			console.error('Error calling OpenAI API:', error);
			editor.replaceRange(`\nエラーが発生しました: ${error.message}\n`, { line: answerStartLine, ch: 0 });
			new Notice('エラーが発生しました');
		}
	}

	/**
	 * 直前の会話ペア(Q-A)を削除し、その前の質問に対する回答を入力できる状態に戻す
	 * 例: Q1->A1->Q2 の状態で実行すると Q1->A(空) の状態に戻る
	 */
	async deleteLastConversation() {
		// TODO: 実装予定
		// 1. アクティブなエディタを取得
		// 2. エディタの内容を取得
		// 3. parseConversation() で会話履歴を解析
		// 4. 削除可能かチェック（history が空なら削除不可）
		// 5. 最後の Q-A ペアを削除した新しい履歴を構築
		// 6. 新しいエディタの内容を生成
		// 7. エディタの内容を更新
		// 8. 成功通知を表示
		throw new Error('Not implemented');
	}

	/**
	 * エディタの内容を解析してQ&A履歴と新しい質問を抽出する
	 */
	private parseConversation(content: string): { history: ConversationMessage[], newQuestion: string } {
		const history: ConversationMessage[] = [];
		let newQuestion = '';

		// # Q と # A で分割する正規表現パターン
		// 行頭の # Q または # A でセクションを区切る
		const sections = content.split(/^# (Q|A)$/m);

		// sections[0]: 最初の # Q より前の内容 (通常は空)
		// sections[1]: 'Q' または 'A'
		// sections[2]: その内容
		// sections[3]: 'Q' または 'A'
		// sections[4]: その内容
		// ... の繰り返し

		let isLastQuestion = false;

		for (let i = 1; i < sections.length; i += 2) {
			const type = sections[i]; // 'Q' または 'A'
			const sectionContent = sections[i + 1]?.trim() || '';

			// --- の区切り線を除去
			const cleanContent = sectionContent.replace(/^---\s*/m, '').trim();

			if (!cleanContent) {
				// 最後の # Q で内容が空の場合は、これから質問を入力する場所
				if (type === 'Q' && i === sections.length - 1) {
					isLastQuestion = true;
				}
				continue;
			}

			if (type === 'Q') {
				// 最後の Q セクションの場合、これが新しい質問
				if (i >= sections.length - 2) {
					// 最後のセクションまたは最後から2番目(最後が空のAの場合)
					// 次のセクションをチェック
					const nextType = sections[i + 2];
					if (!nextType || nextType === 'Q') {
						// 次のセクションがない、またはQの場合 = まだ回答されていない
						newQuestion = cleanContent;
						isLastQuestion = true;
						continue;
					}
				}
				history.push({ role: 'user', content: cleanContent });
			} else if (type === 'A') {
				// # Q の後の内容が新しい質問として検出されていない場合のみ履歴に追加
				if (!isLastQuestion) {
					history.push({ role: 'assistant', content: cleanContent });
				}
			}
		}

		// エディタの内容全体が # Q や # A を含まない場合
		// 全体を新しい質問として扱う
		if (history.length === 0 && !newQuestion) {
			newQuestion = content.trim();
		}

		return { history, newQuestion };
	}

	async streamOpenAIResponse(
		editor: Editor,
		startLine: number,
		history: ConversationMessage[],
		newQuestion: string
	) {
		// システムプロンプトがある場合は先頭に追加
		const messages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [];

		if (this.settings.systemPrompt && this.settings.systemPrompt.trim() !== '') {
			messages.push({
				role: 'system',
				content: this.settings.systemPrompt
			});
		}

		// 会話履歴を追加
		messages.push(...history.map(msg => ({
			role: msg.role,
			content: msg.content
		})));

		// 新しい質問を追加
		messages.push({
			role: 'user',
			content: newQuestion
		});

		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.settings.openAIApiKey}`
			},
			body: JSON.stringify({
				model: this.settings.aiModel, // 設定から動的に取得
				messages: messages,
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

			// ストリーミング完了後、次の質問を促すために # Q を追加
			editor.replaceRange(
				'\n\n---\n\n# Q\n',
				{ line: currentLine, ch: editor.getLine(currentLine).length }
			);
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

	async loadModelOptions() {
		try {
			const adapter = this.app.vault.adapter;
			const pluginDir = this.manifest.dir;
			if (pluginDir) {
				const filePath = `${pluginDir}/modelOptions.json`;
				const content = await adapter.read(filePath);
				this.modelOptions = JSON.parse(content);
			}
		} catch (error) {
			console.error('Failed to load modelOptions.json:', error);
			// デフォルトのモデルオプションを設定
			this.modelOptions = {
				'gpt-5.2': 'gpt-5.2',
				'gpt-5.2-pro': 'gpt-5.2-pro'
			};
		}
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

		// APIキー設定
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

		// AIモデル選択
		new Setting(containerEl)
			.setName('AIモデル')
			.setDesc('使用するAIモデルを選択してください')
			.addDropdown(dropdown => {
				// modelOptions.json から選択肢を追加
				for (const [value, label] of Object.entries(this.plugin.modelOptions)) {
					dropdown.addOption(value, label);
				}

				// 現在の値を設定
				dropdown.setValue(this.plugin.settings.aiModel);

				// 変更時の処理
				dropdown.onChange(async (value) => {
					this.plugin.settings.aiModel = value;
					await this.plugin.saveSettings();
				});
			});

		// システムプロンプト設定
		new Setting(containerEl)
			.setName('システムプロンプト')
			.setDesc('AIの動作を制御するシステムプロンプトを設定できます')
			.addTextArea(text => {
				text
					.setPlaceholder('例: あなたは親切で知識豊富なアシスタントです。')
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(async (value) => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					});

				// テキストエリアのスタイル調整
				text.inputEl.rows = 4;
				text.inputEl.cols = 50;
			});
	}
}
