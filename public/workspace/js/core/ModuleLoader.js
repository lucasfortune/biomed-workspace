/**
 * ModuleLoader - Manages module registration, loading, and lifecycle
 */
// Fallback card icon for modules registered without one (inline SVG, ADR-005)
const DEFAULT_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 0 0-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"/></svg>';

class ModuleLoader {
  constructor(stateManager) {
    this.state = stateManager;
    this.modules = new Map();
    this.activeModule = null;
    this.container = null;
    this.isLoading = false; // Prevent race conditions during module loading

    console.log('[ModuleLoader] Initialized');
  }

  /**
   * Set the container element where modules will be rendered
   * @param {HTMLElement} container - Container element
   */
  setContainer(container) {
    this.container = container;
  }

  /**
   * Register a module
   * @param {Object} moduleConfig - Module configuration
   */
  register(moduleConfig) {
    const {
      id,
      name,
      description,
      icon,
      path,
      inputs,
      outputs,
      color,
      status,
      cardType,
      launchOptions,
      helpArticleId
    } = moduleConfig;

    // Handle multi-launch cards (register each launch option as a loadable module)
    if (cardType === 'multi-launch' && launchOptions) {
      // Register the parent card for display purposes (not loadable directly)
      this.modules.set(id, {
        id,
        name,
        description: description || '',
        icon: icon || DEFAULT_ICON,
        path: null, // Parent card has no path
        inputs: inputs || [],
        outputs: outputs || [],
        status: 'multi-launch', // Special status for parent
        cardType: 'multi-launch',
        launchOptions,
        helpArticleId: helpArticleId || null,
        loaded: false,
        instance: null,
        loadedAt: null,
        isParentCard: true
      });

      // Register each launch option as a separate loadable module
      launchOptions.forEach(opt => {
        this.modules.set(opt.id, {
          id: opt.id,
          name: `${name} - ${opt.label}`,
          description: opt.sublabel || '',
          icon: icon || DEFAULT_ICON,
          path: opt.path,
          inputs: inputs || [],
          outputs: outputs || [],
          status: opt.status || 'available',
          loaded: false,
          instance: null,
          loadedAt: null,
          parentId: id, // Reference to parent card
          isChildModule: true
        });
        console.log(`[ModuleLoader] Registered launch option: ${opt.label} (${opt.id})`);
      });

      console.log(`[ModuleLoader] Registered multi-launch card: ${name} (${id})`);
      return;
    }

    // Validate required fields for standard modules
    if (!id || !name || !path) {
      throw new Error('Module must have id, name, and path');
    }

    this.modules.set(id, {
      id,
      name,
      description: description || '',
      icon: icon || DEFAULT_ICON,
      path,
      inputs: inputs || [],
      outputs: outputs || [],
      status: status || 'available',
      helpArticleId: helpArticleId || null,
      loaded: false,
      instance: null,
      loadedAt: null
    });

    console.log(`[ModuleLoader] Registered module: ${name} (${id})`);
  }

  /**
   * Register multiple modules
   * @param {Array} modules - Array of module configurations
   */
  registerAll(modules) {
    modules.forEach(module => this.register(module));
  }

  /**
   * Load and activate a module
   * @param {string} moduleId - Module ID to load
   * @returns {Promise} Module instance
   */
  async load(moduleId) {
    // Prevent concurrent module loading
    if (this.isLoading) {
      console.warn('[ModuleLoader] Module load already in progress, ignoring request');
      return null;
    }

    const module = this.modules.get(moduleId);

    if (!module) {
      throw new Error(`Module '${moduleId}' not found`);
    }

    if (module.status === 'coming_soon') {
      this.state.notify('info', `${module.name} is coming soon!`);
      return null;
    }

    console.log(`[ModuleLoader] Loading module: ${module.name}`);

    // Set loading lock
    this.isLoading = true;

    // Update UI state
    this.state.update('ui.loading', true);

    try {
      // Deactivate current module if any
      if (this.activeModule) {
        await this.deactivate();
      }

      // Load module if not already loaded
      if (!module.loaded) {
        // Dynamic import
        const ModuleClass = await import(module.path);

        // Create instance
        module.instance = new ModuleClass.default(this.state);
        module.loaded = true;
        module.loadedAt = new Date().toISOString();

        console.log(`[ModuleLoader] Module ${module.name} loaded successfully`);
      }

      // Activate module
      this.activeModule = module;
      await module.instance.activate();

      // Update state
      this.state.update('workspace.activeModule', moduleId);
      this.state.update(`modules.${moduleId}.active`, true);
      this.state.update('ui.currentView', 'module');
      this.state.update('ui.loading', false);

      console.log(`[ModuleLoader] Module ${module.name} activated`);

      return module.instance;
    } catch (error) {
      console.error(`[ModuleLoader] Error loading module ${moduleId}:`, error);
      this.state.notify('error', `Failed to load ${module.name}: ${error.message}`);
      this.state.update('ui.loading', false);
      throw error;
    } finally {
      // Release loading lock
      this.isLoading = false;
    }
  }

  /**
   * Deactivate current module
   */
  async deactivate() {
    if (!this.activeModule) {
      return;
    }

    const module = this.activeModule;

    console.log(`[ModuleLoader] Deactivating module: ${module.name}`);

    try {
      // Call module's deactivate method
      if (module.instance && typeof module.instance.deactivate === 'function') {
        await module.instance.deactivate();
      }
      // Drop the module's stylesheets so nothing leaks into the next module
      if (module.instance && typeof module.instance.unloadCSS === 'function') {
        module.instance.unloadCSS();
      }

      // Update state
      this.state.update(`modules.${module.id}.active`, false);
      this.activeModule = null;

      console.log(`[ModuleLoader] Module ${module.name} deactivated`);
    } catch (error) {
      console.error(`[ModuleLoader] Error deactivating module ${module.id}:`, error);
      throw error;
    }
  }

  /**
   * Return to welcome/hub view
   */
  async returnToHub() {
    await this.deactivate();
    this.state.update('workspace.activeModule', null);
    this.state.update('ui.currentView', 'welcome');

    // Show welcome view
    const welcomeView = document.getElementById('welcome-view');
    const moduleView = document.getElementById('module-view');

    if (welcomeView && moduleView) {
      welcomeView.classList.add('active');
      moduleView.classList.remove('active');
    }

    console.log('[ModuleLoader] Returned to hub');
  }

  /**
   * Get module information
   * @param {string} moduleId - Module ID
   * @returns {Object} Module info
   */
  getModuleInfo(moduleId) {
    const module = this.modules.get(moduleId);

    if (!module) {
      return null;
    }

    return {
      id: module.id,
      name: module.name,
      description: module.description,
      icon: module.icon,
      status: module.status,
      loaded: module.loaded,
      active: this.activeModule?.id === moduleId
    };
  }

  /**
   * Get all registered modules (excludes child modules from multi-launch cards)
   * @returns {Array} Array of module info objects
   */
  getAllModules() {
    const modules = [];

    for (const [id, module] of this.modules) {
      // Skip child modules (they are launched via parent card buttons)
      if (module.isChildModule) {
        continue;
      }

      modules.push({
        id: module.id,
        name: module.name,
        description: module.description,
        icon: module.icon,
        inputs: module.inputs,
        outputs: module.outputs,
        status: module.status,
        loaded: module.loaded,
        active: this.activeModule?.id === id,
        cardType: module.cardType,
        launchOptions: module.launchOptions,
        helpArticleId: module.helpArticleId
      });
    }

    return modules;
  }

  /**
   * Check if a module is loaded
   * @param {string} moduleId - Module ID
   * @returns {boolean} Is loaded
   */
  isLoaded(moduleId) {
    const module = this.modules.get(moduleId);
    return module?.loaded || false;
  }

  /**
   * Check if a module is active
   * @param {string} moduleId - Module ID
   * @returns {boolean} Is active
   */
  isActive(moduleId) {
    return this.activeModule?.id === moduleId;
  }

  /**
   * Get currently active module
   * @returns {Object|null} Active module info
   */
  getActiveModule() {
    if (!this.activeModule) {
      return null;
    }

    return this.getModuleInfo(this.activeModule.id);
  }

  /**
   * Unload a module (free memory)
   * @param {string} moduleId - Module ID
   */
  async unload(moduleId) {
    const module = this.modules.get(moduleId);

    if (!module || !module.loaded) {
      return;
    }

    // Deactivate if currently active
    if (this.activeModule?.id === moduleId) {
      await this.deactivate();
    }

    // Call cleanup if available
    if (module.instance && typeof module.instance.cleanup === 'function') {
      await module.instance.cleanup();
    }

    // Clear instance
    module.instance = null;
    module.loaded = false;
    module.loadedAt = null;

    console.log(`[ModuleLoader] Module ${module.name} unloaded`);
  }

  /**
   * Reload a module
   * @param {string} moduleId - Module ID
   */
  async reload(moduleId) {
    await this.unload(moduleId);
    await this.load(moduleId);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ModuleLoader;
}
