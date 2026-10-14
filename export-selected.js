const fs = require('fs');
const path = require('path');

// ====== EDIT THIS LIST ======
// Use a plain file name to match it anywhere in the project: 'App.jsx'
// Use a partial path if several files share a name: 'src/screens/Home.jsx'
const selectedFiles = [
  'FILE_NAME_1.js',
  'FILE_NAME_2.jsx',
  'FILE_NAME_3.py',
];
// ============================

const outputFile = 'selected-files.txt';

// Directories to skip while searching
const ignoreDirs = [
  'node_modules',
  '.git',
  '.expo',
  'assets',
  'build',
  '.next',
  'venv',
  '.venv',
  '__pycache__',
];

const normalize = (p) => p.split(path.sep).join('/').replace(/^\.\//, '');
const wanted = selectedFiles.map(normalize);
const found = new Set();

let outputContext = '';
let fileCount = 0;

function matchEntry(relPath) {
  // Matches if the relative path equals the entry or ends with "/entry"
  return wanted.find((w) => relPath === w || relPath.endsWith('/' + w));
}

function readDirectory(directory) {
  for (const file of fs.readdirSync(directory)) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!ignoreDirs.includes(file)) readDirectory(fullPath);
    } else {
      const relPath = normalize(path.relative(__dirname, fullPath));
      const match = matchEntry(relPath);

      if (match && file !== path.basename(__filename)) {
        found.add(match);
        fileCount++;
        outputContext += `\n\n--- FILE: ${relPath} ---\n\n`;
        outputContext += fs.readFileSync(fullPath, 'utf8');
      }
    }
  }
}

readDirectory(__dirname);

// Report anything you listed that wasn't found
const missing = wanted.filter((w) => !found.has(w));

fs.writeFileSync(outputFile, outputContext.trimStart());

console.log(`✅ Exported ${fileCount} file(s) to ${outputFile}`);
console.log(`📏 ~${Math.round(outputContext.length / 4)} tokens (rough estimate)`);
if (missing.length) {
  console.log(`⚠️  Not found: ${missing.join(', ')}`);
}