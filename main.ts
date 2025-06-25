import {
  App,
  debounce,
  MarkdownView,
  Plugin,
  PluginManifest,
  PluginSettingTab,
  Setting,
  WorkspaceLeaf,
} from 'obsidian'

/**
 * Defines the settings available for the Scroll Control plugin.
 */
interface ScrollControlSettings {
  /** Whether to show the Scroll to Top button. */
  showScrollTopButton: boolean
  /** Whether to show the Scroll to Bottom button. */
  showScrollBottomButton: boolean
  /** Size preset for the floating buttons. */
  buttonSize: 'small' | 'medium' | 'large'
  /** Custom background color for buttons (hex format). */
  buttonColor: string
  /** Whether to use the custom background color. */
  useCustomColor: boolean
  /** Duration of button animations in milliseconds. */
  animationSpeed: number
  /** Whether to enable button hover/click animations. */
  useAnimations: boolean
  /** If true, Scroll Bottom button appears above Scroll Top button. */
  invertButtonOrder: boolean
  /** Vertical distance between buttons in pixels. */
  buttonSpacing: number
  /** Distance from the right edge of the pane in pixels. */
  horizontalPadding: number
  /** Distance from the bottom edge of the pane in pixels. */
  verticalPadding: number
}

/**
 * Default settings for the plugin.
 */
const DEFAULT_SETTINGS: ScrollControlSettings = {
  showScrollTopButton: true,
  showScrollBottomButton: true,
  buttonSize: 'medium',
  buttonColor: '#666666',
  useCustomColor: false,
  animationSpeed: 300,
  useAnimations: true,
  invertButtonOrder: false,
  buttonSpacing: 12,
  horizontalPadding: 20,
  verticalPadding: 40,
}

// SVG Icons for buttons
const ICONS = {
  scrollTop: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  scrollBottom: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
}

/**
 * Adds floating scroll-to-top and scroll-to-bottom buttons to Markdown views.
 */
export default class ScrollControlPlugin extends Plugin {
  settings: ScrollControlSettings
  leafButtonContainers = new Map<WorkspaceLeaf, HTMLElement>()
  styleEl: HTMLStyleElement | null = null

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest)
    this.settings = DEFAULT_SETTINGS
  }

  /**
   * Plugin load lifecycle method. Loads settings, adds commands, settings tab,
   * injects styles, and initializes buttons for existing and future Markdown views.
   */
  override async onload() {
    await this.loadSettings()

    // Register commands
    this.addCommand({
      id: 'scroll-to-top',
      name: 'Scroll to Top',
      callback: () =>
        this.scrollToPosition('top', this.getActiveMarkdownView()),
    })

    this.addCommand({
      id: 'scroll-to-bottom',
      name: 'Scroll to Bottom',
      callback: () =>
        this.scrollToPosition('bottom', this.getActiveMarkdownView()),
    })

    // Add settings tab
    this.addSettingTab(new ScrollControlSettingTab(this.app, this))

    // Inject Stylesheet
    this.addStyle()

    // Add buttons to existing leaves and listen for layout changes
    this.app.workspace.onLayoutReady(() => {
      this.initializeAllButtons()
      this.registerEvent(
        this.app.workspace.on('layout-change', this.handleLayoutChange),
      )
      // Listen for active leaf changes to update visibility
      this.registerEvent(
        this.app.workspace.on(
          'active-leaf-change',
          this.handleActiveLeafChange,
        ),
      )
    })
  }

  override onunload() {
    // Remove all button containers
    this.leafButtonContainers.forEach((container) => container.remove())
    this.leafButtonContainers.clear()
    // Remove stylesheet
    this.styleEl?.remove()
    this.styleEl = null
  }

  /**
   * Retrieves the MarkdownView instance of the currently active workspace leaf.
   * @returns The active MarkdownView, or null if the active leaf is not a Markdown view.
   */
  private getActiveMarkdownView(): MarkdownView | null {
    const leaf = this.app.workspace.activeLeaf
    if (leaf?.view instanceof MarkdownView) {
      return leaf.view
    }
    return null
  }

  /**
   * Loads plugin settings from storage, merging with defaults.
   */
  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData(),
    ) as ScrollControlSettings
  }

  /**
   * Saves current plugin settings to storage and updates buttons and styles.
   */
  async saveSettings() {
    await this.saveData(this.settings)
    // Re-initialize buttons in all leaves to reflect settings changes
    this.updateAllButtons()
    // Update styles if necessary (e.g., padding, spacing)
    this.updateStyle()
  }

  /**
   * Helper to iterate over all currently open Markdown leaves.
   * @param callback Function to execute for each Markdown leaf.
   */
  private forAllMarkdownLeaves(callback: (leaf: WorkspaceLeaf) => void) {
    this.app.workspace.getLeavesOfType('markdown').forEach(callback)
  }

  /**
   * Creates button containers for all currently open Markdown leaves.
   */
  private initializeAllButtons() {
    this.forAllMarkdownLeaves((leaf) => {
      this.addButtonsToLeaf(leaf)
    })
  }

  /**
   * Removes and re-adds buttons in all Markdown leaves.
   * Used after settings changes that affect button appearance or layout.
   */
  private updateAllButtons() {
    this.forAllMarkdownLeaves((leaf) => {
      this.removeButtonsFromLeaf(leaf) // Remove old ones first
      this.addButtonsToLeaf(leaf) // Add new ones with updated settings
    })
  }

  /**
   * Debounced handler for Obsidian's 'layout-change' event.
   * Detects newly opened or closed Markdown leaves and adds/removes buttons accordingly.
   */
  private handleLayoutChange = debounce(
    () => {
      const currentLeaves = new Set(
        this.app.workspace.getLeavesOfType('markdown'),
      )
      const knownLeaves = new Set(this.leafButtonContainers.keys())

      // Add buttons to new leaves
      currentLeaves.forEach((leaf) => {
        if (!knownLeaves.has(leaf)) {
          this.addButtonsToLeaf(leaf)
        }
      })

      // Remove buttons from closed leaves
      knownLeaves.forEach((leaf) => {
        if (!currentLeaves.has(leaf)) {
          this.removeButtonsFromLeaf(leaf)
        }
      })
    },
    300,
    true,
  )

  /**
   * Handler for Obsidian's 'active-leaf-change' event.
   * Updates the visibility (opacity, pointer-events) of button containers
   * in all managed leaves based on which leaf is now active.
   * @param activeLeaf The newly activated workspace leaf, or null if none.
   */
  private handleActiveLeafChange = (activeLeaf: WorkspaceLeaf | null) => {
    this.leafButtonContainers.forEach((container, leaf) => {
      if (leaf.view instanceof MarkdownView) {
        const shouldBeVisible = leaf === activeLeaf
        container.toggleClass('scroll-control-visible', shouldBeVisible)
        container.toggleClass('scroll-control-hidden', !shouldBeVisible)
      }
    })
  }

  /**
   * Creates and appends a button container to the specified Markdown leaf's content element.
   * Tracks the container and populates it with buttons.
   * Sets initial visibility based on the leaf's active state.
   * @param leaf The workspace leaf to add buttons to.
   */
  private addButtonsToLeaf(leaf: WorkspaceLeaf) {
    if (
      !(leaf.view instanceof MarkdownView) ||
      this.leafButtonContainers.has(leaf)
    ) {
      return // Only add to Markdown views and only if not already added
    }

    const view = leaf.view
    const container = document.createElement('div')
    container.addClass('scroll-control-button-container')

    // Find the .view-content element within the view's container
    const viewContent = view.containerEl.querySelector('.view-content')
    if (!viewContent) {
      return
    }

    viewContent.appendChild(container)
    this.leafButtonContainers.set(leaf, container)
    this.createFloatingButtons(container, view)
    this.updateSingleLeafVisibility(leaf)
  }

  /**
   * Removes the button container from a specific leaf and stops tracking it.
   * @param leaf The workspace leaf to remove buttons from.
   */
  private removeButtonsFromLeaf(leaf: WorkspaceLeaf) {
    if (this.leafButtonContainers.has(leaf)) {
      const container = this.leafButtonContainers.get(leaf)
      container?.remove()
      this.leafButtonContainers.delete(leaf)
    }
  }

  /**
   * Sets the initial visibility (opacity, pointer-events) for a single leaf's button container
   * based on whether it is currently the active leaf.
   * @param leaf The workspace leaf whose button visibility should be updated.
   */
  private updateSingleLeafVisibility(leaf: WorkspaceLeaf) {
    const container = this.leafButtonContainers.get(leaf)
    if (container) {
      const isActive = this.app.workspace.activeLeaf === leaf
      container.toggleClass('scroll-control-visible', isActive)
      container.toggleClass('scroll-control-hidden', !isActive)
    }
  }

  /**
   * Scrolls the provided MarkdownView to the top or bottom.
   * Handles both source and preview modes.
   * @param position 'top' or 'bottom'.
   * @param view The MarkdownView instance to scroll.
   */
  private scrollToPosition(
    position: 'top' | 'bottom',
    view: MarkdownView | null,
  ) {
    if (!view) return

    if (view.getMode() === 'source') {
      const editor = view.editor
      const line = position === 'top' ? 0 : editor.lineCount() - 1
      editor.scrollIntoView(
        { from: { line, ch: 0 }, to: { line, ch: 0 } },
        true, // center
      )
    } else {
      // Preview mode scrolling
      const previewEl = view.previewMode.containerEl.querySelector<HTMLElement>(
        '.markdown-preview-view',
      )
      if (previewEl) {
        previewEl.scrollTo({
          top: position === 'top' ? 0 : previewEl.scrollHeight,
          behavior: this.settings.useAnimations ? 'smooth' : 'auto',
        })
      }
    }
  }

  /**
   * Creates the individual floating action buttons and appends them to the provided container.
   * Button appearance, order, and actions are determined by plugin settings.
   * @param container The parent HTMLElement to append the buttons to.
   * @param view The MarkdownView associated with this set of buttons.
   */
  private createFloatingButtons(container: HTMLElement, view: MarkdownView) {
    // Clear any existing buttons in the container first
    container.empty()

    const createButton = (
      iconSvg: string,
      tooltip: string,
      callback: () => void,
    ) => {
      const button = document.createElement('div')
      button.addClass('scroll-control-button')
      button.addClass(`scroll-control-button-${this.settings.buttonSize}`)
      if (this.settings.useAnimations) {
        button.addClass('scroll-control-button-animated')
      }

      let iconColor = 'currentColor'

      if (this.settings.useCustomColor) {
        button.style.backgroundColor = this.settings.buttonColor
        iconColor = this.getContrastColor(this.settings.buttonColor)
        button.style.color = iconColor
        button.addClass('scroll-control-button-custom')
      } else {
        button.addClass('scroll-control-button-default')
      }

      // Create SVG element using DOM API instead of innerHTML
      const svgElement = this.createSVGFromString(iconSvg, iconColor)
      button.appendChild(svgElement)
      button.setAttribute('aria-label', tooltip)
      // Positioning (bottom, right) is now handled by the container's CSS

      button.addEventListener('click', (event) => {
        event.stopPropagation() // Prevent clicks bubbling up
        callback()
      })
      // Append to the provided container, not document.body
      container.appendChild(button)
    }

    const buttons = []
    if (this.settings.showScrollTopButton) {
      buttons.push({
        icon: ICONS.scrollTop,
        tooltip: 'Scroll to Top',
        callback: () => this.scrollToPosition('top', view),
        order: this.settings.invertButtonOrder ? 1 : 0, // Order based on setting
      })
    }
    if (this.settings.showScrollBottomButton) {
      buttons.push({
        icon: ICONS.scrollBottom,
        tooltip: 'Scroll to Bottom',
        callback: () => this.scrollToPosition('bottom', view),
        order: this.settings.invertButtonOrder ? 0 : 1,
      })
    }

    // Sort buttons based on order and create them
    buttons.sort((a, b) => a.order - b.order)
    buttons.forEach((btnData) => {
      createButton(btnData.icon, btnData.tooltip, btnData.callback)
    })
  }

  /**
   * Creates the plugin's stylesheet element and appends it to the document head.
   * Should be called once during plugin load.
   */
  private addStyle() {
    this.styleEl?.remove()

    this.styleEl = document.createElement('style')
    this.styleEl.setAttribute('id', 'scroll-control-styles')
    document.head.appendChild(this.styleEl)
    this.updateStyle()
  }

  /**
   * Updates the content of the plugin's stylesheet based on current settings.
   * Defines CSS variables and rules for button container and button appearance/positioning.
   */
  private updateStyle() {
    if (!this.styleEl) {
      return
    }

    const {
      horizontalPadding,
      verticalPadding,
      buttonSpacing,
      animationSpeed,
    } = this.settings

    const css = `
			:root {
				--scroll-control-horizontal-padding: ${horizontalPadding}px;
				--scroll-control-vertical-padding: ${verticalPadding}px;
				--scroll-control-button-spacing: ${buttonSpacing}px;
				--scroll-control-animation-speed: ${animationSpeed}ms;
			}

			/* Ensure the view content area establishes a positioning context */
			.view-content {
				position: relative;
			}

			/* Remove rules targeting specific scroll containers directly */
			/* .markdown-source-view .cm-scroller,
			.markdown-preview-view {
				position: relative; 
			} */

			.scroll-control-button-container {
				position: absolute;
				/* Use logical properties for positioning */
				inset-block-end: var(--scroll-control-vertical-padding);
				inset-inline-end: var(--scroll-control-horizontal-padding);
				/* Use a high z-index, leveraging Obsidian's layers if possible */
				z-index: var(--layer-popover, 100); /* Keep high fallback */
				/* Always use flex display, visibility controlled by opacity/pointer-events */
				display: flex;
				opacity: 0; /* Hidden by default via opacity */
				pointer-events: none; /* Non-interactive by default */
				transition: opacity 0.2s ease-in-out; /* Add transition for smoother show/hide */
				flex-direction: column;
				gap: var(--scroll-control-button-spacing);
				align-items: flex-end; /* Align buttons to the right */
			}

			/* Remove the rule relying on .is-active for display */
			/* .workspace-leaf.is-active .scroll-control-button-container {
				display: flex;
			} */

			.scroll-control-button {
				pointer-events: auto; /* Buttons within container should be clickable */
				background-color: var(--background-secondary); /* Use secondary background by default */
				color: var(--text-normal); /* Default icon color */
				border-radius: 50%;
				display: flex;
				align-items: center;
				justify-content: center;
				cursor: pointer;
				box-shadow: 0 2px 5px var(--background-modifier-box-shadow);
				opacity: 0.7;
				filter: brightness(1.25); /* Lighten default background more */
				transition: all 0.2s ease;
				user-select: none; /* Prevent text selection */
			}

			.scroll-control-button-small {
				width: 24px;
				height: 24px;
				padding: 4px;
			}
			.scroll-control-button-small svg {
				width: 16px; height: 16px;
			}

			.scroll-control-button-medium {
				width: 32px;
				height: 32px;
				padding: 8px;
			}
			.scroll-control-button-medium svg {
				width: 20px; height: 20px;
			}

			.scroll-control-button-large {
				width: 40px;
				height: 40px;
				padding: 10px;
			}
			.scroll-control-button-large svg {
				width: 24px; height: 24px;
			}

			.scroll-control-button:hover {
				opacity: 1;
				transform: scale(1.1);
			}

			.scroll-control-button-animated {
				transition: all var(--scroll-control-animation-speed) cubic-bezier(0.4, 0, 0.2, 1);
			}

			.scroll-control-button svg {
				stroke-width: 2;
			}
		`

    this.styleEl.textContent = css
  }

  /**
   * Creates an SVG element from an SVG string using DOM API.
   * @param svgString - The SVG markup as a string.
   * @param strokeColor - The stroke color to apply to the SVG.
   * @returns The created SVG element.
   */
  public createSVGFromString(
    svgString: string,
    strokeColor: string,
  ): SVGElement {
    const parser = new DOMParser()
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml')
    const svgElement = svgDoc.documentElement as unknown as SVGElement

    // Set stroke color if not using currentColor
    if (strokeColor !== 'currentColor') {
      svgElement.setAttribute('stroke', strokeColor)
    }

    return svgElement
  }

  /**
   * Calculates contrast color (black or white) for a given hex color.
   * @param hexColor - The background color in hex format (e.g., "#RRGGBB").
   * @returns "#000000" (black) or "#FFFFFF" (white).
   */
  public getContrastColor(hexColor: string): string {
    if (!hexColor || hexColor.length < 4) {
      return '#000000' // Default to black for invalid input
    }

    // Expand shorthand hex (e.g., "#03F" -> "#0033FF")
    if (hexColor.length === 4) {
      hexColor =
        '#' +
        hexColor[1] +
        hexColor[1] +
        hexColor[2] +
        hexColor[2] +
        hexColor[3] +
        hexColor[3]
    }

    // Convert hex to RGB
    const r = parseInt(hexColor.substring(1, 3), 16)
    const g = parseInt(hexColor.substring(3, 5), 16)
    const b = parseInt(hexColor.substring(5, 7), 16)

    // Calculate luminance using the WCAG formula
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

    // Return black or white based on luminance
    return luminance > 0.5 ? '#000000' : '#FFFFFF'
  }
}

/**
 * Adds the plugin's settings tab to Obsidian's settings panel.
 */
class ScrollControlSettingTab extends PluginSettingTab {
  plugin: ScrollControlPlugin
  private previewContainer!: HTMLElement

  constructor(app: App, plugin: ScrollControlPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  /**
   * Called by Obsidian to render the settings tab.
   * Clears existing content and rebuilds settings controls.
   */
  display(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl('h2', { text: 'Scroll Control Settings' })

    // --- Live Preview Section ---
    containerEl.createEl('h3', { text: 'Live Preview' })
    this.previewContainer = containerEl.createDiv(
      'scroll-control-settings-preview',
    )
    // Add CSS class for preview container styling
    this.previewContainer.addClass('scroll-control-settings-preview')

    // --- General Settings ---
    containerEl.createEl('h3', { text: 'General Appearance' })

    // Button Size
    new Setting(containerEl)
      .setName('Button Size')
      .setDesc('Choose the size of the scroll buttons')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('small', 'Small')
          .addOption('medium', 'Medium')
          .addOption('large', 'Large')
          .setValue(this.plugin.settings.buttonSize)
          .onChange(async (value: string) => {
            if (value === 'small' || value === 'medium' || value === 'large') {
              this.plugin.settings.buttonSize = value
              this.updatePreviewButtons()
              await this.plugin.saveSettings()
            }
          }),
      )

    // Custom Color
    new Setting(containerEl)
      .setName('Use Custom Color')
      .setDesc('Enable custom color for buttons')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useCustomColor)
          .onChange(async (value) => {
            this.plugin.settings.useCustomColor = value
            colorSetting.settingEl.toggleClass(
              'scroll-control-setting-visible',
              value,
            )
            colorSetting.settingEl.toggleClass(
              'scroll-control-setting-hidden',
              !value,
            )
            this.updatePreviewButtons()
            await this.plugin.saveSettings()
          }),
      )

    // Color Picker
    const colorSetting = new Setting(containerEl)
      .setName('Button Color')
      .setDesc('Choose a custom color for the buttons')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.buttonColor)
          .setValue(this.plugin.settings.buttonColor)
          .onChange(async (value) => {
            this.plugin.settings.buttonColor =
              value || DEFAULT_SETTINGS.buttonColor
            this.updatePreviewButtons()
            await this.plugin.saveSettings()
          }),
      )
    // Hide/show based on the toggle state without redrawing the whole tab
    colorSetting.settingEl.toggleClass(
      'scroll-control-setting-visible',
      this.plugin.settings.useCustomColor,
    )
    colorSetting.settingEl.toggleClass(
      'scroll-control-setting-hidden',
      !this.plugin.settings.useCustomColor,
    )

    // Animations
    new Setting(containerEl)
      .setName('Use Animations')
      .setDesc('Enable button animations')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useAnimations)
          .onChange(async (value) => {
            this.plugin.settings.useAnimations = value
            // Directly toggle visibility of the speed setting
            animationSpeedSetting.settingEl.toggleClass(
              'scroll-control-setting-visible',
              value,
            )
            animationSpeedSetting.settingEl.toggleClass(
              'scroll-control-setting-hidden',
              !value,
            )
            await this.plugin.saveSettings()
          }),
      )

    // Animation Speed
    const animationSpeedSetting = new Setting(containerEl)
      .setName('Animation Speed')
      .setDesc('Adjust the speed of animations (in milliseconds)')
      .addSlider((slider) =>
        slider
          .setLimits(100, 1000, 100)
          .setValue(this.plugin.settings.animationSpeed)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.animationSpeed = value
            await this.plugin.saveSettings()
          }),
      )

    // Hide/show based on the toggle state without redrawing the whole tab
    animationSpeedSetting.settingEl.toggleClass(
      'scroll-control-setting-visible',
      this.plugin.settings.useAnimations,
    )
    animationSpeedSetting.settingEl.toggleClass(
      'scroll-control-setting-hidden',
      !this.plugin.settings.useAnimations,
    )

    // Button Visibility Settings
    containerEl.createEl('h3', { text: 'Button Visibility' })

    new Setting(containerEl)
      .setName('Show Scroll to Top Button')
      .setDesc('Toggle visibility of the Scroll to Top button')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showScrollTopButton)
          .onChange(async (value) => {
            this.plugin.settings.showScrollTopButton = value
            this.updatePreviewButtons()
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName('Show Scroll to Bottom Button')
      .setDesc('Toggle visibility of the Scroll to Bottom button')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showScrollBottomButton)
          .onChange(async (value) => {
            this.plugin.settings.showScrollBottomButton = value
            this.updatePreviewButtons()
            await this.plugin.saveSettings()
          }),
      )

    containerEl.createEl('h3', {
      text: 'Floating Button Position & Spacing',
    })

    new Setting(containerEl)
      .setName('Invert Vertical Order')
      .setDesc(
        'If enabled, the Scroll to Bottom button will be above the Scroll to Top button.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.invertButtonOrder)
          .onChange(async (value) => {
            this.plugin.settings.invertButtonOrder = value
            this.updatePreviewButtons()
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName('Vertical Button Spacing')
      .setDesc('Vertical distance between the buttons (in pixels).')
      .addSlider((slider) =>
        slider
          .setLimits(0, 32, 2) // Range 0-32px, step 2px
          .setValue(this.plugin.settings.buttonSpacing)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.buttonSpacing = value
            this.updatePreviewButtons()
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName('Horizontal Padding')
      .setDesc('Distance from the right edge of the pane (in pixels)')
      .addSlider((slider) =>
        slider
          .setLimits(0, 100, 4)
          .setValue(this.plugin.settings.horizontalPadding)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.horizontalPadding = value
            this.updatePreviewButtons()
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName('Vertical Padding')
      .setDesc('Distance from the bottom edge of the window (in pixels)')
      .addSlider((slider) =>
        slider
          .setLimits(20, 100, 4)
          .setValue(this.plugin.settings.verticalPadding)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.verticalPadding = value
            this.updatePreviewButtons()
            await this.plugin.saveSettings()
          }),
      )

    // Initial render of the preview
    this.updatePreviewButtons()
  }

  /**
   * Renders the preview buttons in the settings tab based on current settings.
   */
  private updatePreviewButtons(): void {
    if (!this.previewContainer) {
      return
    }

    this.previewContainer.empty()
    const settings = this.plugin.settings

    // Determine button background, contrasting preview background, and icon color
    let buttonBackgroundColor: string
    let finalIconColor: string
    let previewBackgroundColor: string
    let previewTextColor = ''

    if (settings.useCustomColor) {
      try {
        // Validate custom color first
        const dummyDiv = document.createElement('div')
        // Test setting background color directly for validation
        dummyDiv.style.backgroundColor = settings.buttonColor
        if (!dummyDiv.style.backgroundColor) {
          throw new Error('Invalid background color format')
        }

        buttonBackgroundColor = settings.buttonColor
        finalIconColor = this.plugin.getContrastColor(buttonBackgroundColor)

        // Preview background should contrast with the BUTTON background
        const contrastToButtonBg = this.plugin.getContrastColor(
          buttonBackgroundColor,
        )

        previewBackgroundColor = contrastToButtonBg
        // Text color should contrast with the PREVIEW background
        previewTextColor = this.plugin.getContrastColor(previewBackgroundColor)
      } catch {
        // Fallback to theme defaults if custom color is invalid
        buttonBackgroundColor = 'var(--background-secondary)' // Default button BG (secondary)
        finalIconColor = 'var(--text-normal)' // Default icon color
        previewBackgroundColor = 'var(--text-normal)' // Preview BG = default icon color
        previewTextColor = 'var(--background-secondary)' // Preview text = default button BG
      }
    } else {
      // Use theme defaults when custom color is off
      buttonBackgroundColor = 'var(--background-secondary)' // Button uses secondary BG
      finalIconColor = 'var(--text-normal)' // Icon uses theme text color
      previewBackgroundColor = 'var(--text-normal)' // Preview BG = theme text color
      previewTextColor = 'var(--background-secondary)' // Preview text contrasts with preview BG
    }

    this.previewContainer.style.backgroundColor = previewBackgroundColor
    this.previewContainer.style.color = previewTextColor

    const buttons = []
    if (settings.showScrollTopButton) {
      buttons.push({
        icon: ICONS.scrollTop,
        tooltip: 'Scroll to Top (Preview)',
        order: settings.invertButtonOrder ? 1 : 0,
      })
    }
    if (settings.showScrollBottomButton) {
      buttons.push({
        icon: ICONS.scrollBottom,
        tooltip: 'Scroll to Bottom (Preview)',
        order: settings.invertButtonOrder ? 0 : 1,
      })
    }

    if (buttons.length === 0) {
      this.previewContainer.createSpan({ text: 'No buttons enabled' })
      return
    }

    buttons.sort((a, b) => a.order - b.order)

    const previewButtonWrapper = this.previewContainer.createDiv()
    previewButtonWrapper.addClass('scroll-control-preview-wrapper')
    previewButtonWrapper.style.gap = `${settings.buttonSpacing}px`

    buttons.forEach((btnData) => {
      const button = previewButtonWrapper.createDiv()
      button.addClass('scroll-control-button')
      button.addClass(`scroll-control-button-${settings.buttonSize}`)
      button.addClass('scroll-control-preview-button')

      let iconColor: string

      if (settings.useCustomColor) {
        try {
          // Validate again for safety, using the determined button BG color
          const dummyDiv = document.createElement('div')
          dummyDiv.style.backgroundColor = buttonBackgroundColor
          if (!dummyDiv.style.backgroundColor)
            throw new Error('Invalid color format for button')

          // Icon color contrasts with the button background color
          iconColor = finalIconColor
          button.style.backgroundColor = buttonBackgroundColor
          button.style.color = iconColor
          button.addClass('scroll-control-button-custom')
        } catch {
          // Fallback if validation fails here (should be caught above)
          button.addClass('scroll-control-button-default')
          iconColor = 'var(--text-normal)'
        }
      } else {
        // Use theme defaults determined above for button background and icon color
        button.style.backgroundColor = buttonBackgroundColor
        button.style.color = finalIconColor
        button.addClass('scroll-control-button-default')
        iconColor = finalIconColor
      }

      // Create SVG element using DOM API instead of innerHTML
      const svgElement = this.plugin.createSVGFromString(
        btnData.icon,
        iconColor,
      )
      button.appendChild(svgElement)
      button.setAttribute('aria-label', btnData.tooltip)
    })
  }
}
