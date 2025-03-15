import { App, MarkdownView, Plugin, PluginSettingTab, Setting } from "obsidian";

interface ScrollControlSettings {
	showScrollTopButton: boolean;
	showScrollBottomButton: boolean;
	showScrollUpButton: boolean;
	showScrollDownButton: boolean;
	buttonPosition: "toolbar" | "ribbon" | "floating";
	scrollStep: number; // Number of lines to scroll for partial scrolling
	buttonSize: "small" | "medium" | "large";
	buttonColor: string;
	useCustomColor: boolean;
	animationSpeed: number;
	useAnimations: boolean;
	autoHide: boolean;
	autoHideDelay: number;
	horizontalPadding: number;
	verticalPadding: number;
}

const DEFAULT_SETTINGS: ScrollControlSettings = {
	showScrollTopButton: true,
	showScrollBottomButton: true,
	showScrollUpButton: false,
	showScrollDownButton: false,
	buttonPosition: "floating",
	scrollStep: 10,
	buttonSize: "medium",
	buttonColor: "#666666",
	useCustomColor: false,
	animationSpeed: 300,
	useAnimations: true,
	autoHide: false,
	autoHideDelay: 2000,
	horizontalPadding: 16,
	verticalPadding: 40,
};

// SVG Icons for buttons
const ICONS = {
	scrollTop: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
	scrollBottom: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
	scrollUp: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
	scrollDown: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
};

export default class ScrollControlPlugin extends Plugin {
	settings: ScrollControlSettings;
	floatingButtons: HTMLElement[] = [];

	async onload() {
		await this.loadSettings();

		// Register commands
		this.addCommand({
			id: "scroll-to-top",
			name: "Scroll to Top",
			callback: () => this.scrollToPosition("top"),
		});

		this.addCommand({
			id: "scroll-to-bottom",
			name: "Scroll to Bottom",
			callback: () => this.scrollToPosition("bottom"),
		});

		this.addCommand({
			id: "scroll-up",
			name: "Scroll Up",
			callback: () => this.scrollPartial("up"),
		});

		this.addCommand({
			id: "scroll-down",
			name: "Scroll Down",
			callback: () => this.scrollPartial("down"),
		});

		// Add settings tab
		this.addSettingTab(new ScrollControlSettingTab(this.app, this));

		// Initialize buttons based on settings
		this.initializeButtons();
	}

	onunload() {
		this.removeFloatingButtons();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.initializeButtons();
	}

	private scrollToPosition(position: "top" | "bottom") {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		if (view.getMode() === "source") {
			const editor = view.editor;
			const line = position === "top" ? 0 : editor.lineCount() - 1;
			editor.scrollIntoView(
				{ from: { line, ch: 0 }, to: { line, ch: 0 } },
				true
			);
		} else {
			const previewEl = view.contentEl.querySelector(
				".markdown-preview-view"
			);
			if (previewEl) {
				previewEl.scrollTo({
					top: position === "top" ? 0 : previewEl.scrollHeight,
					behavior: "smooth",
				});
			}
		}
	}

	private scrollPartial(direction: "up" | "down") {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		if (view.getMode() === "source") {
			const editor = view.editor;
			const currentLine = editor.getCursor().line;
			const targetLine =
				direction === "up"
					? Math.max(0, currentLine - this.settings.scrollStep)
					: Math.min(
							editor.lineCount() - 1,
							currentLine + this.settings.scrollStep
					  );

			editor.scrollIntoView(
				{
					from: { line: targetLine, ch: 0 },
					to: { line: targetLine, ch: 0 },
				},
				true
			);
		} else {
			const previewEl = view.contentEl.querySelector(
				".markdown-preview-view"
			);
			if (previewEl) {
				const scrollAmount = this.settings.scrollStep * 20; // Approximate pixels per line
				previewEl.scrollBy({
					top: direction === "up" ? -scrollAmount : scrollAmount,
					behavior: "smooth",
				});
			}
		}
	}

	private initializeButtons() {
		this.removeFloatingButtons();

		if (this.settings.buttonPosition === "floating") {
			this.createFloatingButtons();
		} else if (this.settings.buttonPosition === "ribbon") {
			this.createRibbonButtons();
		}
		// Mobile toolbar buttons are handled through commands
	}

	private createFloatingButtons() {
		const createButton = (
			icon: string,
			tooltip: string,
			callback: () => void,
			position: number
		) => {
			const button = document.createElement("div");
			button.addClass("scroll-control-button");
			button.addClass(
				`scroll-control-button-${this.settings.buttonSize}`
			);
			if (this.settings.useAnimations) {
				button.addClass("scroll-control-button-animated");
			}
			button.innerHTML = icon;
			button.setAttribute("aria-label", tooltip);
			button.style.bottom = `${
				this.settings.verticalPadding + position * 48
			}px`;
			button.style.right = `${this.settings.horizontalPadding}px`;

			if (this.settings.useCustomColor) {
				button.style.backgroundColor = this.settings.buttonColor;
			}

			button.addEventListener("click", callback);
			document.body.appendChild(button);
			this.floatingButtons.push(button);

			if (this.settings.autoHide) {
				this.setupAutoHide(button);
			}
		};

		let position = 0;
		if (this.settings.showScrollTopButton) {
			createButton(
				ICONS.scrollTop,
				"Scroll to Top",
				() => this.scrollToPosition("top"),
				position++
			);
		}
		if (this.settings.showScrollUpButton) {
			createButton(
				ICONS.scrollUp,
				"Scroll Up",
				() => this.scrollPartial("up"),
				position++
			);
		}
		if (this.settings.showScrollDownButton) {
			createButton(
				ICONS.scrollDown,
				"Scroll Down",
				() => this.scrollPartial("down"),
				position++
			);
		}
		if (this.settings.showScrollBottomButton) {
			createButton(
				ICONS.scrollBottom,
				"Scroll to Bottom",
				() => this.scrollToPosition("bottom"),
				position++
			);
		}

		this.addStyle();
	}

	private createRibbonButtons() {
		if (this.settings.showScrollTopButton) {
			this.addRibbonIcon("arrow-up", "Scroll to Top", () =>
				this.scrollToPosition("top")
			);
		}
		if (this.settings.showScrollBottomButton) {
			this.addRibbonIcon("arrow-down", "Scroll to Bottom", () =>
				this.scrollToPosition("bottom")
			);
		}
	}

	private removeFloatingButtons() {
		this.floatingButtons.forEach((button) => button.remove());
		this.floatingButtons = [];
	}

	private setupAutoHide(button: HTMLElement) {
		let timeout: NodeJS.Timeout;

		const showButton = () => {
			button.style.opacity = "1";
			clearTimeout(timeout);
			timeout = setTimeout(() => {
				button.style.opacity = "0";
			}, this.settings.autoHideDelay);
		};

		document.addEventListener("scroll", () => showButton(), {
			passive: true,
		});
		button.addEventListener("mouseover", () => showButton());
	}

	private addStyle() {
		const css = `
            .scroll-control-button {
                position: fixed;
                z-index: 1000;
                background-color: var(--background-secondary);
                color: var(--text-normal);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 2px 5px var(--background-modifier-box-shadow);
                opacity: 0.7;
                transition: all 0.2s ease;
            }

            .scroll-control-button-small {
                width: 24px;
                height: 24px;
                padding: 4px;
            }

            .scroll-control-button-medium {
                width: 32px;
                height: 32px;
                padding: 8px;
            }

            .scroll-control-button-large {
                width: 40px;
                height: 40px;
                padding: 10px;
            }

            .scroll-control-button:hover {
                opacity: 1;
                transform: scale(1.1);
            }

            .scroll-control-button-animated {
                transition: all ${this.settings.animationSpeed}ms cubic-bezier(0.4, 0, 0.2, 1);
            }

            .scroll-control-button svg {
                width: 100%;
                height: 100%;
            }
        `;

		const styleEl = document.createElement("style");
		styleEl.textContent = css;
		document.head.appendChild(styleEl);
	}
}

class ScrollControlSettingTab extends PluginSettingTab {
	plugin: ScrollControlPlugin;

	constructor(app: App, plugin: ScrollControlPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Scroll Control Settings" });

		// Button Position
		new Setting(containerEl)
			.setName("Button Position")
			.setDesc("Choose where to display the scroll buttons")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("floating", "Floating Buttons")
					.addOption("ribbon", "Ribbon")
					.addOption("toolbar", "Mobile Toolbar")
					.setValue(this.plugin.settings.buttonPosition)
					.onChange(
						async (
							value: ScrollControlSettings["buttonPosition"]
						) => {
							this.plugin.settings.buttonPosition = value;
							await this.plugin.saveSettings();
						}
					)
			);

		// Button Size
		new Setting(containerEl)
			.setName("Button Size")
			.setDesc("Choose the size of the scroll buttons")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("small", "Small")
					.addOption("medium", "Medium")
					.addOption("large", "Large")
					.setValue(this.plugin.settings.buttonSize)
					.onChange(
						async (value: ScrollControlSettings["buttonSize"]) => {
							this.plugin.settings.buttonSize = value;
							await this.plugin.saveSettings();
						}
					)
			);

		// Custom Color
		new Setting(containerEl)
			.setName("Use Custom Color")
			.setDesc("Enable custom color for buttons")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useCustomColor)
					.onChange(async (value) => {
						this.plugin.settings.useCustomColor = value;
						await this.plugin.saveSettings();
					})
			);

		// Color Picker
		if (this.plugin.settings.useCustomColor) {
			new Setting(containerEl)
				.setName("Button Color")
				.setDesc("Choose a custom color for the buttons")
				.addText((text) =>
					text
						.setPlaceholder("#666666")
						.setValue(this.plugin.settings.buttonColor)
						.onChange(async (value) => {
							this.plugin.settings.buttonColor = value;
							await this.plugin.saveSettings();
						})
				);
		}

		// Animations
		new Setting(containerEl)
			.setName("Use Animations")
			.setDesc("Enable button animations")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useAnimations)
					.onChange(async (value) => {
						this.plugin.settings.useAnimations = value;
						await this.plugin.saveSettings();
					})
			);

		if (this.plugin.settings.useAnimations) {
			new Setting(containerEl)
				.setName("Animation Speed")
				.setDesc("Adjust the speed of animations (in milliseconds)")
				.addSlider((slider) =>
					slider
						.setLimits(100, 1000, 100)
						.setValue(this.plugin.settings.animationSpeed)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.animationSpeed = value;
							await this.plugin.saveSettings();
						})
				);
		}

		// Auto-hide
		new Setting(containerEl)
			.setName("Auto-hide Buttons")
			.setDesc("Automatically hide buttons after a delay")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoHide)
					.onChange(async (value) => {
						this.plugin.settings.autoHide = value;
						await this.plugin.saveSettings();
					})
			);

		if (this.plugin.settings.autoHide) {
			new Setting(containerEl)
				.setName("Auto-hide Delay")
				.setDesc("Time before buttons are hidden (in milliseconds)")
				.addSlider((slider) =>
					slider
						.setLimits(500, 5000, 500)
						.setValue(this.plugin.settings.autoHideDelay)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.autoHideDelay = value;
							await this.plugin.saveSettings();
						})
				);
		}

		// Button Visibility Settings
		containerEl.createEl("h3", { text: "Button Visibility" });

		new Setting(containerEl)
			.setName("Show Scroll to Top Button")
			.setDesc("Toggle visibility of the Scroll to Top button")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showScrollTopButton)
					.onChange(async (value) => {
						this.plugin.settings.showScrollTopButton = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show Scroll to Bottom Button")
			.setDesc("Toggle visibility of the Scroll to Bottom button")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showScrollBottomButton)
					.onChange(async (value) => {
						this.plugin.settings.showScrollBottomButton = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show Scroll Up Button")
			.setDesc("Toggle visibility of the Scroll Up button")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showScrollUpButton)
					.onChange(async (value) => {
						this.plugin.settings.showScrollUpButton = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show Scroll Down Button")
			.setDesc("Toggle visibility of the Scroll Down button")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showScrollDownButton)
					.onChange(async (value) => {
						this.plugin.settings.showScrollDownButton = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Scroll Step")
			.setDesc("Number of lines to scroll for partial scrolling")
			.addSlider((slider) =>
				slider
					.setLimits(5, 30, 5)
					.setValue(this.plugin.settings.scrollStep)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.scrollStep = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Button Position and Spacing" });

		new Setting(containerEl)
			.setName("Horizontal Padding")
			.setDesc("Distance from the right edge of the window (in pixels)")
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 4)
					.setValue(this.plugin.settings.horizontalPadding)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.horizontalPadding = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Vertical Padding")
			.setDesc("Distance from the bottom edge of the window (in pixels)")
			.addSlider((slider) =>
				slider
					.setLimits(20, 100, 4)
					.setValue(this.plugin.settings.verticalPadding)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.verticalPadding = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
