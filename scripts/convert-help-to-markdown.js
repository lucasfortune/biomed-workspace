#!/usr/bin/env node
/**
 * Convert JSON help articles to Markdown with YAML frontmatter
 *
 * This script migrates the help system from JSON-based lazy loading to a
 * manifest-based markdown system. It:
 * 1. Reads all JSON module files
 * 2. Converts articles to markdown with YAML frontmatter
 * 3. Disambiguates duplicate titles with parenthetical suffixes
 * 4. Generates manifest.json with complete glossary
 *
 * Usage: node scripts/convert-help-to-markdown.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  contentDir: path.join(__dirname, '../public/workspace/content'),
  modulesDir: path.join(__dirname, '../public/workspace/content/modules'),
  outputDir: path.join(__dirname, '../public/workspace/content'),

  // Human-readable module names for disambiguation
  moduleDisplayNames: {
    'segmentation': 'Segmentation',
    'denoising-dl': 'DL Denoising',
    'denoising-filter': 'Filter Denoising',
    'denoising': 'Denoising',
    'annotation': 'Annotation',
    'mesh': 'Mesh',
    'visualization': 'Visualization',
    'imageviewer': 'Image Viewer',
    'file-browser': 'File Browser'
  }
};

// Simple YAML serializer (no external dependencies)
function toYaml(obj, indent = 0) {
  const spaces = '  '.repeat(indent);
  let result = '';

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        result += `${spaces}${key}: []\n`;
      } else if (typeof value[0] === 'string') {
        // Inline array for simple strings
        const escaped = value.map(v => {
          if (v.includes('"') || v.includes(':') || v.includes('#')) {
            return `"${v.replace(/"/g, '\\"')}"`;
          }
          return v;
        });
        result += `${spaces}${key}:\n`;
        escaped.forEach(v => {
          result += `${spaces}  - ${v}\n`;
        });
      } else {
        result += `${spaces}${key}:\n`;
        value.forEach(item => {
          result += toYaml(item, indent + 1);
        });
      }
    } else if (typeof value === 'object') {
      result += `${spaces}${key}:\n`;
      result += toYaml(value, indent + 1);
    } else if (typeof value === 'string') {
      // Handle multiline strings and special characters
      if (value.includes('\n') || value.length > 80) {
        result += `${spaces}${key}: |\n`;
        value.split('\n').forEach(line => {
          result += `${spaces}  ${line}\n`;
        });
      } else if (value.includes(':') || value.includes('#') || value.includes('"') || value.startsWith('-')) {
        result += `${spaces}${key}: "${value.replace(/"/g, '\\"')}"\n`;
      } else {
        result += `${spaces}${key}: ${value}\n`;
      }
    } else {
      result += `${spaces}${key}: ${value}\n`;
    }
  }

  return result;
}

class HelpContentConverter {
  constructor(config, dryRun = false) {
    this.config = config;
    this.dryRun = dryRun;

    // Collected data
    this.articles = new Map();  // articleId -> article object
    this.moduleGlossaries = {}; // moduleName -> glossary terms
    this.modules = new Set();

    // Statistics
    this.stats = {
      filesRead: 0,
      articlesConverted: 0,
      duplicatesFound: 0
    };
  }

  async convert() {
    console.log(`\n${'='.repeat(60)}`);
    console.log('Help Content Conversion: JSON to Markdown');
    console.log(`${'='.repeat(60)}\n`);

    if (this.dryRun) {
      console.log('DRY RUN MODE - No files will be written\n');
    }

    // Step 1: Load all JSON files
    console.log('Step 1: Loading JSON files...');
    await this.loadAllJsonFiles();
    console.log(`  Loaded ${this.stats.filesRead} files, ${this.articles.size} articles\n`);

    // Step 2: Detect and resolve duplicate titles
    console.log('Step 2: Detecting duplicate titles...');
    const duplicates = this.detectDuplicateTitles();
    console.log(`  Found ${duplicates.size} titles with duplicates\n`);

    // Step 3: Generate displayTitles for duplicates
    console.log('Step 3: Generating disambiguated display titles...');
    this.generateDisplayTitles(duplicates);
    console.log(`  Processed ${this.stats.duplicatesFound} duplicate articles\n`);

    // Step 4: Convert articles to markdown
    console.log('Step 4: Converting articles to Markdown...');
    await this.convertAllArticles();
    console.log(`  Converted ${this.stats.articlesConverted} articles\n`);

    // Step 5: Generate manifest
    console.log('Step 5: Generating manifest.json...');
    await this.generateManifest();
    console.log('  Manifest generated\n');

    // Summary
    this.printSummary(duplicates);
  }

  async loadAllJsonFiles() {
    // Load standalone getting-started.json
    const gettingStartedPath = path.join(this.config.contentDir, 'getting-started.json');
    if (fs.existsSync(gettingStartedPath)) {
      const data = JSON.parse(fs.readFileSync(gettingStartedPath, 'utf-8'));
      data._module = 'getting-started';
      data._isStandalone = true;
      this.articles.set(data.id, data);
      this.stats.filesRead++;
    }

    // Load module JSON files
    const moduleFiles = fs.readdirSync(this.config.modulesDir)
      .filter(f => f.endsWith('.json'));

    for (const file of moduleFiles) {
      const filePath = path.join(this.config.modulesDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const moduleName = data.module || file.replace('.json', '');

      this.modules.add(moduleName);
      this.stats.filesRead++;

      // Store module glossary if present
      if (data.glossary) {
        this.moduleGlossaries[moduleName] = data.glossary;
      }

      // Process articles
      if (data.articles && Array.isArray(data.articles)) {
        for (const article of data.articles) {
          article._module = moduleName;
          this.articles.set(article.id, article);
        }
      }
    }
  }

  detectDuplicateTitles() {
    const titleMap = new Map(); // title -> [articleIds]

    for (const [id, article] of this.articles) {
      const title = article.title;
      if (!titleMap.has(title)) {
        titleMap.set(title, []);
      }
      titleMap.get(title).push(id);
    }

    // Filter to only titles with multiple articles
    const duplicates = new Map();
    for (const [title, ids] of titleMap) {
      if (ids.length > 1) {
        duplicates.set(title, ids);
      }
    }

    return duplicates;
  }

  generateDisplayTitles(duplicates) {
    for (const [title, ids] of duplicates) {
      for (const id of ids) {
        const article = this.articles.get(id);
        const moduleName = article._module;
        const displayModuleName = this.config.moduleDisplayNames[moduleName] || moduleName;

        article._displayTitle = `${title} (${displayModuleName})`;
        this.stats.duplicatesFound++;
      }
    }
  }

  async convertAllArticles() {
    for (const [id, article] of this.articles) {
      const markdown = this.articleToMarkdown(article);
      const outputPath = this.getOutputPath(article);

      if (!this.dryRun) {
        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(outputPath, markdown);
      }

      // Store the relative path for manifest
      article._path = path.relative(this.config.outputDir, outputPath).replace(/\\/g, '/');
      this.stats.articlesConverted++;
    }
  }

  articleToMarkdown(article) {
    // Build frontmatter object
    const frontmatter = {
      id: article.id,
      title: article.title
    };

    // Add displayTitle only if different from title
    if (article._displayTitle && article._displayTitle !== article.title) {
      frontmatter.displayTitle = article._displayTitle;
    }

    // Add optional fields
    if (article.category) frontmatter.category = article.category;
    if (article._module && article._module !== 'getting-started') {
      frontmatter.module = article._module;
    }
    if (article.tags && article.tags.length > 0) {
      frontmatter.tags = article.tags;
    }
    if (article.seeAlsoManual && article.seeAlsoManual.length > 0) {
      frontmatter.seeAlsoManual = article.seeAlsoManual;
    }
    if (article.seeAlsoTags && article.seeAlsoTags.length > 0) {
      frontmatter.seeAlsoTags = article.seeAlsoTags;
    }
    if (article.content?.parameterImpact) {
      frontmatter.parameterImpact = article.content.parameterImpact;
    }

    // Build markdown content
    let markdown = '---\n';
    markdown += toYaml(frontmatter);
    markdown += '---\n\n';

    // Title
    markdown += `# ${article.title}\n\n`;

    // Summary as lead paragraph
    if (article.content?.summary) {
      markdown += `${article.content.summary}\n\n`;
    }

    // Body content
    if (article.content?.body) {
      markdown += this.convertBodyToMarkdown(article.content.body);
    }

    return markdown;
  }

  convertBodyToMarkdown(body) {
    if (!body) return '';

    let md = body;

    // Convert section-like patterns to headers
    // Lines that end with colon and are followed by content
    md = md.replace(/^([A-Z][A-Za-z0-9\s\-\/\(\)]+):$/gm, '\n## $1\n');

    // Convert "What X:" or "How X:" patterns
    md = md.replace(/^(What|How|When|Why|Where|Which|Best|Important|Note|Tip|Requirements|Recommendations|Benefits|Values)[^:]*:$/gm, '\n## $&\n');

    // Convert bullet-like patterns at start of line
    md = md.replace(/^[-•]\s+/gm, '- ');
    md = md.replace(/^(\d+)\.\s+/gm, '$1. ');

    // Ensure proper paragraph spacing
    md = md.replace(/\n(?!\n)/g, '\n\n');
    md = md.replace(/\n{3,}/g, '\n\n');

    // Clean up header spacing
    md = md.replace(/\n\n(##)/g, '\n\n$1');
    md = md.replace(/(##[^\n]+)\n\n\n/g, '$1\n\n');

    return md.trim() + '\n';
  }

  getOutputPath(article) {
    // Standalone articles go to content root
    if (article._isStandalone) {
      return path.join(this.config.outputDir, `${article.id}.md`);
    }

    const moduleName = article._module;
    const moduleDir = path.join(this.config.outputDir, 'modules', moduleName);

    // Generate filename from article ID
    let filename;
    if (article.id === moduleName) {
      filename = '_module.md';  // Module overview article
    } else {
      // Remove module prefix and convert dots to dashes
      const idWithoutModule = article.id.replace(`${moduleName}.`, '');
      filename = idWithoutModule.replace(/\./g, '-') + '.md';
    }

    return path.join(moduleDir, filename);
  }

  async generateManifest() {
    const manifest = {
      version: '2.0.0',
      generated: new Date().toISOString(),
      articles: {},
      glossary: {},
      modules: Array.from(this.modules).sort()
    };

    // Build articles index
    for (const [id, article] of this.articles) {
      manifest.articles[id] = {
        id: article.id,
        title: article.title,
        displayTitle: article._displayTitle || article.title,
        category: article.category || 'general',
        module: article._module !== 'getting-started' ? article._module : null,
        tags: article.tags || [],
        path: article._path,
        seeAlsoManual: article.seeAlsoManual || [],
        seeAlsoTags: article.seeAlsoTags || []
      };
    }

    // Build alphabetical glossary
    const glossaryIndex = {};

    // Add all articles to glossary (using displayTitle)
    for (const [id, article] of this.articles) {
      const displayTitle = article._displayTitle || article.title;
      const firstLetter = displayTitle.charAt(0).toUpperCase();

      if (!glossaryIndex[firstLetter]) {
        glossaryIndex[firstLetter] = [];
      }

      glossaryIndex[firstLetter].push({
        term: displayTitle,
        articleId: id
      });
    }

    // Add module glossary terms
    for (const [moduleName, glossary] of Object.entries(this.moduleGlossaries)) {
      for (const [key, termData] of Object.entries(glossary)) {
        const firstLetter = termData.term.charAt(0).toUpperCase();

        if (!glossaryIndex[firstLetter]) {
          glossaryIndex[firstLetter] = [];
        }

        // Check if term already exists
        const exists = glossaryIndex[firstLetter].some(t => t.term === termData.term);
        if (!exists) {
          glossaryIndex[firstLetter].push({
            term: termData.term,
            definition: termData.definition,
            articleId: moduleName  // Link to module overview
          });
        }
      }
    }

    // Sort terms within each letter
    for (const letter of Object.keys(glossaryIndex)) {
      glossaryIndex[letter].sort((a, b) => a.term.localeCompare(b.term));
    }

    manifest.glossary = glossaryIndex;

    // Write manifest
    if (!this.dryRun) {
      const manifestPath = path.join(this.config.outputDir, 'manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    return manifest;
  }

  printSummary(duplicates) {
    console.log(`${'='.repeat(60)}`);
    console.log('Conversion Summary');
    console.log(`${'='.repeat(60)}\n`);

    console.log(`Files read:        ${this.stats.filesRead}`);
    console.log(`Articles total:    ${this.articles.size}`);
    console.log(`Articles converted: ${this.stats.articlesConverted}`);
    console.log(`Modules:           ${this.modules.size}`);
    console.log(`Duplicate titles:  ${duplicates.size}`);
    console.log(`Articles renamed:  ${this.stats.duplicatesFound}\n`);

    if (duplicates.size > 0) {
      console.log('Disambiguated titles:');
      console.log('-'.repeat(60));
      for (const [title, ids] of duplicates) {
        console.log(`\n"${title}":`);
        for (const id of ids) {
          const article = this.articles.get(id);
          console.log(`  -> "${article._displayTitle}" (${id})`);
        }
      }
      console.log();
    }

    if (this.dryRun) {
      console.log('\nDRY RUN - No files were written.');
      console.log('Run without --dry-run to perform the conversion.\n');
    } else {
      console.log('\nConversion complete!');
      console.log(`Output directory: ${this.config.outputDir}\n`);
    }
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const converter = new HelpContentConverter(CONFIG, dryRun);

  try {
    await converter.convert();
  } catch (error) {
    console.error('Conversion failed:', error);
    process.exit(1);
  }
}

main();
