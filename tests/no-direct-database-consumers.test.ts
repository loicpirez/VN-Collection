import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const SOURCE_ROOT = join(ROOT, 'src');
const LEGACY_MODULES = new Set(['@/lib/db', './db']);
const ALLOWED_DYNAMIC_IMPORTS = new Set([
  'src/app/api/backup/restore/route.ts',
  'src/app/api/backup/route.ts',
  'src/app/api/health/route.ts',
  'src/lib/db/raw-cache-export.ts',
  'src/lib/schema-local.ts',
  'src/lib/stock-batch-store.ts',
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return false;
  return clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function location(file: ts.SourceFile, node: ts.Node): string {
  const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
  return `${relative(ROOT, file.fileName)}:${line + 1}`;
}

function directDatabaseImports(path: string): string[] {
  const body = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, body, ts.ScriptTarget.Latest, true);
  const offenders: string[] = [];
  const projectPath = relative(ROOT, path);
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && LEGACY_MODULES.has(node.moduleSpecifier.text)
      && !isTypeOnlyImport(node)
    ) {
      offenders.push(`${location(source, node)} static value import`);
    }
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
      && LEGACY_MODULES.has(node.arguments[0].text)
      && !projectPath.startsWith('src/lib/db/repositories/')
      && !ALLOWED_DYNAMIC_IMPORTS.has(projectPath)
    ) {
      offenders.push(`${location(source, node)} unapproved dynamic import`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return offenders;
}

describe('database persistence boundary', () => {
  it('keeps runtime consumers behind repositories and isolates legacy SQLite fallbacks', () => {
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((path) => !path.endsWith('/src/lib/db.ts'))
      .filter((path) => !relative(ROOT, path).startsWith('src/lib/db/repositories/'))
      .flatMap(directDatabaseImports);
    expect(offenders).toEqual([]);
  });
});
