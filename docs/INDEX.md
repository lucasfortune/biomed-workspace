# Developer Documentation

Technical documentation for the BioMed Workspace (version 1.5.0). For using
the platform, see the
[user documentation](https://lucasfortune.github.io/the-virtual-parasite/workspace/);
the in-app help articles live in `public/workspace/content/` and are synced
to that site automatically.

---

## Guides

| Guide | Description |
|---|---|
| [Getting Started](guides/GETTING_STARTED.md) | Installation, setup, first run |
| [Deployment](guides/DEPLOYMENT.md) | Production setup with nginx, PM2 and HTTPS |
| [Module Creation](guides/MODULE_CREATION.md) | Adding a new processing module |
| [Module Framework](guides/MODULE_FRAMEWORK.md) | Shared module components (step chrome, slice viewers, validation) |
| [Testing](guides/TESTING.md) | Testing strategies and tools |
| [Troubleshooting](guides/TROUBLESHOOTING.md) | Common issues and solutions |

## Architecture

| Document | Description |
|---|---|
| [Overview](architecture/OVERVIEW.md) | High-level system architecture |
| [Module Architecture](architecture/MODULE_ARCHITECTURE.md) | Module system and `BaseModule` |
| [State Architecture](architecture/STATE_ARCHITECTURE.md) | State management patterns |
| [Authentication](architecture/AUTHENTICATION.md) | Sessions, accounts and admin approval |

## Reference

| Reference | Description |
|---|---|
| [API Endpoints](reference/API_ENDPOINTS.md) | HTTP endpoint catalog |
| [Socket Protocol](reference/SOCKET_PROTOCOL.md) | Real-time events (Socket.IO) |
| [Python Integration](reference/PYTHON_INTEGRATION.md) | How the server calls the Python scripts |
| [State Management](reference/STATE_MANAGEMENT.md) | `StateManager` API |
| [Module System](reference/MODULE_SYSTEM.md) | `ModuleLoader` API |
| [File Structure](reference/FILE_STRUCTURE.md) | Codebase organization |

A starting point for new modules is the template in
[`public/workspace/js/modules/template/`](../public/workspace/js/modules/template/README.md).

## Architecture decision records

| ADR | Title |
|---|---|
| [ADR-001](decisions/001_vanilla_js_over_framework.md) | Vanilla JS over a framework |
| [ADR-002](decisions/002_dual_version_approach.md) | Dual version approach (superseded) |
| [ADR-003](decisions/003_session_based_isolation.md) | Session-based isolation |
| [ADR-004](decisions/004_module_system_design.md) | Module system design |
| [ADR-005](decisions/005_design_system_color_scheme.md) | Design system and color scheme |
| [ADR-006](decisions/006_asn2v_routed_v1_migration.md) | AutoStructN2V routed v1 migration |
| [ADR-007](decisions/007_stack_stitching_module.md) | Stack stitching module |
| [ADR-008](decisions/008_preprocess_module.md) | Preprocessing module |
| [ADR-009](decisions/009_segcleanup_module.md) | Segmentation cleanup and quantification |
| [ADR-010](decisions/010_format_conversion.md) | File format conversion and mesh simplification |
| [ADR-011](decisions/011_shared_viewer_chrome_and_conventions.md) | Shared viewer chrome and UI conventions |
| [ADR-012](decisions/012_workspace_data_model_consolidation.md) | Workspace data model consolidation |

---

## Finding what you need

| I want to... | Look here |
|---|---|
| Install and run the app | [Getting Started](guides/GETTING_STARTED.md) |
| Understand the system design | [Overview](architecture/OVERVIEW.md), then the [ADRs](#architecture-decision-records) |
| Understand how files, provenance and cleanup work | [ADR-012](decisions/012_workspace_data_model_consolidation.md) |
| Look up an endpoint | [API Endpoints](reference/API_ENDPOINTS.md) |
| Add or change a module | [Module Creation](guides/MODULE_CREATION.md), [Module Framework](guides/MODULE_FRAMEWORK.md) |
| Work with the Python pipeline | [Python Integration](reference/PYTHON_INTEGRATION.md) |
| Find a file | [File Structure](reference/FILE_STRUCTURE.md) |
| Fix a problem | [Troubleshooting](guides/TROUBLESHOOTING.md) or [GitHub Issues](https://github.com/lucasfortune/biomed-workspace/issues) |
