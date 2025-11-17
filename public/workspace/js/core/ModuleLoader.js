/**
 * ModuleLoader - Manages module registration, loading, and lifecycle
 */
class ModuleLoader {
  constructor(stateManager) {
    this.state = stateManager;
    this.modules = new Map();
    this.activeModule = null;
    this.container = null;

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
      status
    } = moduleConfig;

    // Validate required fields
    if (!id || !name || !path) {
      throw new Error('Module must have id, name, and path');
    }

    this.modules.set(id, {
      id,
      name,
      description: description || '',
      icon: icon || '📦',
      path,
      inputs: inputs || [],
      outputs: outputs || [],
      color: color || '#4A90E2',
      status: status || 'available',
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
    const module = this.modules.get(moduleId);

    if (!module) {
      throw new Error(`Module '${moduleId}' not found`);
    }

    if (module.status === 'coming_soon') {
      this.state.notify('info', `${module.name} is coming soon!`);
      return null;
    }

    console.log(`[ModuleLoader] Loading module: ${module.name}`);

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
   * Get all registered modules
   * @returns {Array} Array of module info objects
   */
  getAllModules() {
    const modules = [];

    for (const [id, module] of this.modules) {
      modules.push({
        id: module.id,
        name: module.name,
        description: module.description,
        icon: module.icon,
        inputs: module.inputs,
        outputs: module.outputs,
        color: module.color,
        status: module.status,
        loaded: module.loaded,
        active: this.activeModule?.id === id
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
