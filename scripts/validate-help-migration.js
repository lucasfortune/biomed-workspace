#!/usr/bin/env node
/**
 * Validate Help System Migration
 *
 * Verifies that:
 * 1. manifest.json exists and has correct structure
 * 2. All markdown files referenced in manifest exist
 * 3. All article IDs are preserved from original JSON
 * 4. Duplicate titles are properly disambiguated
 * 5. All help icon references in codebase exist in manifest
 *
 * Usage: node scripts/validate-help-migration.js
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  contentDir: path.join(__dirname, '../public/workspace/content'),
  modulesDir: path.join(__dirname, '../public/workspace/content/modules'),
  workspaceDir: path.join(__dirname, '../public/workspace')
};

class MigrationValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.stats = {};
  }

  validate() {
    console.log('\n' + '='.repeat(60));
    console.log('Help System Migration Validation');
    console.log('='.repeat(60) + '\n');

    // Step 1: Check manifest exists
    this.checkManifest();

    // Step 2: Verify markdown files
    this.verifyMarkdownFiles();

    // Step 3: Compare with original JSON
    this.compareWithOriginal();

    // Step 4: Check duplicate disambiguation
    this.checkDuplicateDisambiguation();

    // Step 5: Verify help icon references
    this.verifyHelpIconReferences();

    // Print results
    this.printResults();

    return this.errors.length === 0;
  }

  checkManifest() {
    console.log('Step 1: Checking manifest.json...');

    const manifestPath = path.join(CONFIG.contentDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      this.errors.push('manifest.json not found');
      return;
    }

    try {
      this.manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      // Check structure
      if (!this.manifest.articles) {
        this.errors.push('manifest.json missing "articles" field');
      }
      if (!this.manifest.glossary) {
        this.errors.push('manifest.json missing "glossary" field');
      }
      if (!this.manifest.version) {
        this.warnings.push('manifest.json missing "version" field');
      }

      this.stats.manifestArticles = Object.keys(this.manifest.articles || {}).length;
      this.stats.glossaryLetters = Object.keys(this.manifest.glossary || {}).length;
      this.stats.glossaryTerms = Object.values(this.manifest.glossary || {})
        .reduce((sum, terms) => sum + terms.length, 0);

      console.log(`  Found ${this.stats.manifestArticles} articles in manifest`);
      console.log(`  Glossary has ${this.stats.glossaryTerms} terms across ${this.stats.glossaryLetters} letters`);
    } catch (e) {
      this.errors.push(`Failed to parse manifest.json: ${e.message}`);
    }
  }

  verifyMarkdownFiles() {
    console.log('\nStep 2: Verifying markdown files...');

    if (!this.manifest) return;

    let found = 0;
    let missing = 0;

    for (const [id, entry] of Object.entries(this.manifest.articles)) {
      const mdPath = path.join(CONFIG.contentDir, entry.path);
      if (fs.existsSync(mdPath)) {
        found++;
      } else {
        missing++;
        this.errors.push(`Missing markdown file: ${entry.path} (${id})`);
      }
    }

    this.stats.markdownFound = found;
    this.stats.markdownMissing = missing;

    console.log(`  ${found} markdown files found`);
    if (missing > 0) {
      console.log(`  ${missing} markdown files MISSING`);
    }
  }

  compareWithOriginal() {
    console.log('\nStep 3: Comparing with original JSON...');

    const originalIds = new Set();

    // Load original JSON files
    const jsonFiles = fs.readdirSync(CONFIG.modulesDir)
      .filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const data = JSON.parse(
        fs.readFileSync(path.join(CONFIG.modulesDir, file), 'utf-8')
      );
      if (data.articles) {
        data.articles.forEach(a => originalIds.add(a.id));
      }
    }

    // Check getting-started
    const gsPath = path.join(CONFIG.contentDir, 'getting-started.json');
    if (fs.existsSync(gsPath)) {
      const gsData = JSON.parse(fs.readFileSync(gsPath, 'utf-8'));
      if (gsData.id) {
        originalIds.add(gsData.id);
      }
    }

    this.stats.originalCount = originalIds.size;

    // Compare
    let preserved = 0;
    let missing = 0;

    for (const id of originalIds) {
      if (this.manifest.articles[id]) {
        preserved++;
      } else {
        missing++;
        this.errors.push(`Original article ID not in manifest: ${id}`);
      }
    }

    console.log(`  Original JSON had ${originalIds.size} articles`);
    console.log(`  ${preserved} IDs preserved in manifest`);
    if (missing > 0) {
      console.log(`  ${missing} IDs MISSING from manifest`);
    }
  }

  checkDuplicateDisambiguation() {
    console.log('\nStep 4: Checking duplicate title disambiguation...');

    if (!this.manifest) return;

    // Group by title
    const byTitle = {};
    for (const [id, entry] of Object.entries(this.manifest.articles)) {
      const title = entry.title;
      if (!byTitle[title]) {
        byTitle[title] = [];
      }
      byTitle[title].push({ id, ...entry });
    }

    // Check duplicates
    let duplicateTitles = 0;
    let properlyDisambiguated = 0;
    let notDisambiguated = 0;

    for (const [title, articles] of Object.entries(byTitle)) {
      if (articles.length > 1) {
        duplicateTitles++;

        // Check if displayTitles are unique
        const displayTitles = articles.map(a => a.displayTitle);
        const uniqueDisplayTitles = new Set(displayTitles);

        if (uniqueDisplayTitles.size === articles.length) {
          properlyDisambiguated++;
        } else {
          notDisambiguated++;
          this.errors.push(
            `Duplicate title "${title}" not fully disambiguated: ` +
            articles.map(a => a.displayTitle).join(', ')
          );
        }
      }
    }

    this.stats.duplicateTitles = duplicateTitles;

    console.log(`  ${duplicateTitles} titles have duplicates`);
    console.log(`  ${properlyDisambiguated} properly disambiguated`);
    if (notDisambiguated > 0) {
      console.log(`  ${notDisambiguated} NOT properly disambiguated`);
    }
  }

  verifyHelpIconReferences() {
    console.log('\nStep 5: Verifying help icon references...');

    const referencedIds = new Set();

    // Scan workspace JS files for data-info-id
    this.scanDirectory(CONFIG.workspaceDir, referencedIds);

    this.stats.referencedIds = referencedIds.size;

    let found = 0;
    let missing = 0;

    for (const id of referencedIds) {
      if (this.manifest.articles[id]) {
        found++;
      } else {
        missing++;
        this.warnings.push(`Help icon references unknown article: ${id}`);
      }
    }

    console.log(`  Found ${referencedIds.size} article references in code`);
    console.log(`  ${found} exist in manifest`);
    if (missing > 0) {
      console.log(`  ${missing} references to unknown articles (may be intentional)`);
    }
  }

  scanDirectory(dir, ids) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        this.scanDirectory(fullPath, ids);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.html')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const matches = content.matchAll(/data-info-id=["']([^"']+)["']/g);
          for (const match of matches) {
            ids.add(match[1]);
          }
        } catch (e) {
          // Skip unreadable files
        }
      }
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('Validation Summary');
    console.log('='.repeat(60) + '\n');

    console.log('Statistics:');
    console.log(`  Manifest articles:     ${this.stats.manifestArticles || 0}`);
    console.log(`  Glossary terms:        ${this.stats.glossaryTerms || 0}`);
    console.log(`  Markdown files:        ${this.stats.markdownFound || 0}`);
    console.log(`  Original JSON articles: ${this.stats.originalCount || 0}`);
    console.log(`  Duplicate titles:      ${this.stats.duplicateTitles || 0}`);
    console.log(`  Code references:       ${this.stats.referencedIds || 0}`);

    console.log(`\nErrors: ${this.errors.length}`);
    console.log(`Warnings: ${this.warnings.length}`);

    if (this.errors.length > 0) {
      console.log('\nErrors:');
      this.errors.forEach(e => console.log(`  - ${e}`));
    }

    if (this.warnings.length > 0) {
      console.log('\nWarnings:');
      this.warnings.slice(0, 10).forEach(w => console.log(`  - ${w}`));
      if (this.warnings.length > 10) {
        console.log(`  ... and ${this.warnings.length - 10} more`);
      }
    }

    console.log('\n' + (this.errors.length === 0 ? 'VALIDATION PASSED' : 'VALIDATION FAILED') + '\n');
  }
}

// Run validation
const validator = new MigrationValidator();
const success = validator.validate();
process.exit(success ? 0 : 1);
