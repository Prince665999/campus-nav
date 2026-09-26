const fs = require('fs');
const path = require('path');

const outputFile = 'full-stack-codebase.txt';

// Directories to ignore
const ignoreDirs = [
  'node_modules', 
  '.git', 
  '.expo', 
  'assets', 
  'build', 
  '.next', 
  'venv', 
  '.venv', 
  '__pycache__'
];

// File types to collect
const allowedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.py'];

let outputContext = '';

function readDirectory(directory) {
  const files = fs.readdirSync(directory);

  for (const file of files) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!ignoreDirs.includes(file)) {
        readDirectory(fullPath);
      }
    } else {
      const ext = path.extname(file);
      if (allowedExtensions.includes(ext) && file !== 'export-all.js') {
        const content = fs.readFileSync(fullPath, 'utf8');
        outputContext += `\n\n--- FILE: ${fullPath} ---\n\n`;
        outputContext += content;
      }
    }
  }
}

readDirectory(__dirname);
fs.writeFileSync(outputFile, outputContext);
console.log(`✅ Full-stack codebase exported to ${outputFile}`);