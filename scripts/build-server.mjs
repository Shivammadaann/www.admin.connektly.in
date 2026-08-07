import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, 'server.ts');
const outputPath = path.join(projectRoot, 'server.runtime.js');
const source = await readFile(sourcePath, 'utf8');

const result = ts.transpileModule(source, {
  fileName: sourcePath,
  reportDiagnostics: true,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    esModuleInterop: true,
    isolatedModules: true,
    verbatimModuleSyntax: true,
  },
});

const errors = (result.diagnostics || []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);

if (errors.length > 0) {
  for (const diagnostic of errors) {
    console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  }
  process.exit(1);
}

await writeFile(outputPath, result.outputText, 'utf8');
console.log(`Transpiled ${path.basename(sourcePath)} to ${path.basename(outputPath)}.`);
