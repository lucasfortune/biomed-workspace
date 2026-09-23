# BioMed Workspace

A browser-based workspace for processing volumetric microscopy data, from raw
image stack to segmented, quantified 3D surface. Nine modules share one file
system, one provenance model and one design language, so a stack can be
cropped, denoised, annotated, segmented, cleaned up, stitched, meshed and
viewed in 3D without leaving the browser or writing code.

The workspace is developed within the DFG priority programme SPP 2332
"Physics of Parasitism". A public instance runs at
**[thevirtualparasite.net](https://www.thevirtualparasite.net)**, with user
documentation at
**[lucasfortune.github.io/the-virtual-parasite](https://lucasfortune.github.io/the-virtual-parasite/workspace/)**.

![Version](https://img.shields.io/badge/version-1.5.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933)
![Python](https://img.shields.io/badge/Python-3.9+-3776AB)
![License](https://img.shields.io/badge/license-BSD--3--Clause-green)

---

## Modules

Modules are listed in pipeline order, as they appear on the workspace hub.

| Module | What it does |
|---|---|
| **Image Viewer** | View TIFF stacks in gallery and thumbnail modes, compare two stacks side by side |
| **Preprocessing** | Crop, trim, flip, downscale and re-window stacks before processing |
| **Denoising: Deep Learning** | Self-supervised denoising with Noise2Void and [AutoStructN2V](https://github.com/lucasfortune/asn2v), which detects structured noise and routes each stack to the matching training recipe |
| **Denoising: Filter-Based** | Gaussian and non-local-means filtering with automatic noise estimation |
| **Annotation** | Paint multi-class labels on image stacks to create training data |
| **U-Net Segmentation** | Train a U-Net on annotated stacks with live training curves, then segment new volumes |
| **Segmentation Cleanup** | Fill holes, remove specks, smooth, merge classes, touch up by hand, and export per-class quantification as CSV |
| **Stack Stitching** | Join stacks along z or as mosaics using overlay alignment; alignments are saved as reusable recipes |
| **Surface Mesh Generation** | Convert segmented volumes to 3D surface meshes with physical voxel scaling |
| **3D Visualization** | Explore meshes interactively in the browser (Three.js) |

Across all modules:

- **File browser** with search, batch operations, format conversion (TIFF and
  MRC import/export), and ZIP export and restore of a whole workspace.
- **Provenance.** Every file records its full processing history, including
  the trained model behind a result, and outputs get readable, chained names.
- **Physical metadata.** Voxel sizes travel with the data from upload to mesh.
- **Built-in help.** 104 context-sensitive help articles and a glossary,
  reachable from the help icon next to each control. The same content is
  published to the documentation site.
- **Sample data.** Every new workspace is seeded with a matched raw stack and
  annotation, so the full pipeline can be tried without uploading anything.
- **Real-time progress** for training and inference via Socket.IO.
- **Private workspaces.** Each session has an isolated workspace; data is
  retained for 48 hours after last activity, and users keep their work as ZIP
  archives.

---

## Running your own instance

### Requirements

- Node.js 18 or newer (`.nvmrc` pins 20)
- Python 3.9 or newer
- 8 GB RAM minimum; 16 GB and a CUDA-capable GPU are recommended for training

### Installation

```bash
git clone https://github.com/lucasfortune/biomed-workspace.git
cd biomed-workspace

# Node dependencies
npm install

# Python environment. The server expects the interpreter at ./venv/bin/python
# (./venv/Scripts/python.exe on Windows); a symlink to an existing env also works.
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install PyTorch first, choosing the build for your CUDA version:
#   https://pytorch.org/get-started/locally/
pip install torch torchvision
pip install -r requirements.txt

npm start                         # then open http://localhost:3000
```

On first start the server writes a `.env` file with a generated
`SESSION_SECRET`. AutoStructN2V is vendored under `python/vendor/` and needs
no separate installation.

### First login

Accounts require approval by an admin. Create the first admin from the
command line:

```bash
node manageUsers.js add-admin <username> <password> "<Full Name>" <email> "<Institution>"
```

New users register through the web interface; approve them with:

```bash
node manageUsers.js list-pending
node manageUsers.js approve <username>
```

`node manageUsers.js` without arguments lists all commands (reject, remove,
reset-password, ban-email, ...).

### Common commands

```bash
npm run dev             # development mode with auto-reload (nodemon)
PORT=3001 npm start     # custom port
HOST=0.0.0.0 npm start  # listen on all interfaces (default is 127.0.0.1)
```

For a production setup (nginx, PM2, HTTPS) see the
[deployment guide](docs/guides/DEPLOYMENT.md).

---

## Project structure

```
server.js              Express entry point
WorkspaceManager.js    Workspace, file and provenance management
manageUsers.js         User administration CLI
src/                   Backend: routes, services, middleware, sockets, config
public/
  workspace/           Workspace frontend (vanilla JS modules, help content)
  *.html, js/, css/    Login, registration and admin pages
python/                Processing scripts called by the server
  vendor/              Vendored AutoStructN2V v1.0
test_data/             Sample stacks seeded into new workspaces
docs/                  Architecture, reference, guides and ADRs
```

---

## Documentation

- **User documentation:** [the-virtual-parasite docs site](https://lucasfortune.github.io/the-virtual-parasite/workspace/)
- **Developer documentation:** [docs/INDEX.md](docs/INDEX.md), including the
  [architecture overview](docs/architecture/OVERVIEW.md),
  [API reference](docs/reference/API_ENDPOINTS.md),
  [module creation guide](docs/guides/MODULE_CREATION.md) and
  [troubleshooting guide](docs/guides/TROUBLESHOOTING.md)
- **Design decisions:** twelve architecture decision records in
  [docs/decisions/](docs/decisions/)

---

## Related projects

- [AutoStructN2V](https://github.com/lucasfortune/asn2v): structured-noise-aware
  self-supervised denoising, used by the Deep Learning Denoising module
- [PhantEM](https://github.com/lucasfortune/phantem): synthetic benchmark
  generation for electron microscopy denoising

---

## License

The source code is released under the [BSD 3-Clause License](LICENSE).

The vendored AutoStructN2V package is distributed under its own BSD 3-Clause
license ([python/vendor/autoStructN2V_LICENSE](python/vendor/autoStructN2V_LICENSE)).
The Physics of Parasitism and DFG logos in `public/imgs/` are not covered by
the license and remain the property of their respective owners.

## Acknowledgements

Developed within the DFG priority programme SPP 2332 "Physics of Parasitism".
The public instance runs on de.NBI cloud infrastructure.
